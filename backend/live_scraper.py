"""
Live E-Commerce Bulk Catalog Scraper - Predictive Demand & Trend Arbitrage Engine
==================================================================================
Dynamically pulls top active, in-stock, non-bundle products across three distinct
US e-commerce categories:
  1. Health & Wellness
  2. Pet Supplies
  3. Athletic Gear

Hits each target Shopify store's `/products.json` endpoint, filters out bundles and
out-of-stock items, normalizes pricing strictly to USD floats, dynamically tags
each SKU with its parent store's category, and emits records matching the Newsvendor
math engine schema:

    {
        "sku_id": "LIVE-HLTH-001",
        "product_name": "<Scraped Title>",
        "category": "Health & Wellness" | "Pet Supplies" | "Athletic Gear",
        "unit_cost": <30% of retail_price>,
        "retail_price": <Scraped USD price as float>,
        "stock_status": "In Stock" | "Low Stock"
    }

Compliance & Geo Guardrails:
- Strict US headers (`Accept-Language: en-US,en;q=0.9`, US desktop Chrome User-Agent)
  and US/USD Shopify localization cookies.
- robots.txt is checked before every request; disallowed URLs are skipped.
- Rate-limited per host with bounded retries/backoff.
- Bot-protection / CAPTCHA pages are skipped without attempting to bypass them.
- Multi-pack and bundle listings (`bundle`, `pack`, `set`, `duo`, `trio`, `kit`,
  `month supply`) are automatically excluded.

Usage:
    python backend/live_scraper.py
    python backend/live_scraper.py --per-store 6 --json-out live_signals.json
    python backend/live_scraper.py --category "Pet Supplies" --per-store 8
"""

from __future__ import annotations

import argparse
import json
import logging
import re
import sys
import time
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple
from urllib import robotparser
from urllib.parse import urlparse

import pandas as pd
import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

UNIT_COST_RATIO = 0.30  # MVP assumption: landed unit cost = 30% of retail price
LOW_STOCK_UNITS = 20  # inventory_quantity at/below this is treated as "Low Stock"
DEFAULT_PRODUCTS_PER_STORE = 6  # Pull 5 to 10 valid in-stock non-bundle products per store

# (connect timeout, read timeout) in seconds
REQUEST_TIMEOUT: Tuple[float, float] = (5.0, 15.0)
DEFAULT_DELAY_SECONDS = 1.5

# Strict US-market request profile: US English locale, standard US desktop browser
US_HEADERS: Dict[str, str] = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "application/json;q=0.8,*/*;q=0.7"
    ),
    "Accept-Encoding": "gzip, deflate",
    "Connection": "keep-alive",
}

# Shopify Markets localization cookies -> request the US storefront / USD pricing
US_COOKIES: Dict[str, str] = {
    "localization": "US",
    "cart_currency": "USD",
}

# Target US Shopify stores organized by the exact React frontend category names
TARGET_STORES_BY_CATEGORY: Dict[str, List[str]] = {
    "Health & Wellness": [
        "https://www.doublewoodsupplements.com",
        "https://www.zhounutrition.com",
        "https://www.nutricost.com",
        "https://www.maryruthorganics.com",
    ],
    "Pet Supplies": [
        "https://www.wilderdog.com",
        "https://www.maxbone.com",
        "https://www.finn.com",
        "https://www.honestpaws.com",
    ],
    "Athletic Gear": [
        "https://www.gymshark.com",
        "https://www.nobullproject.com",
        "https://www.roguefitness.com",
        "https://www.trxtraining.com",
        "https://www.blenderbottle.com",
    ],
}

CATEGORY_SKU_PREFIX: Dict[str, str] = {
    "Health & Wellness": "LIVE-HLTH",
    "Pet Supplies": "LIVE-PET",
    "Athletic Gear": "LIVE-ATH",
}

# Multi-pack / bundle listings distort unit pricing, so they are excluded.
# Matched as whole words (plural allowed) so "sunset", "reset" or "kitten" don't trigger it.
BUNDLE_EXCLUSION_KEYWORDS: Tuple[str, ...] = (
    "bundle",
    "pack",
    "set",
    "duo",
    "trio",
    "kit",
    "month supply",
)
BUNDLE_PATTERN = re.compile(
    r"\b(?:"
    + "|".join(re.escape(k).replace(r"\ ", r"\s+") for k in BUNDLE_EXCLUSION_KEYWORDS)
    + r")s?\b",
    re.IGNORECASE,
)

# Also skip gift cards or non-physical promotional add-ons in broad catalog mode
NON_MERCHANDISE_PATTERN = re.compile(
    r"\b(?:gift\s*card|e-?gift|digital\s*card|warranty|route\s+package|shipping\s+protection)\b",
    re.IGNORECASE,
)

NON_USD_MARKERS = (
    "€",
    "£",
    "¥",
    "₹",
    "CA$",
    "C$",
    "A$",
    "AU$",
    "NZ$",
    "CAD",
    "AUD",
    "EUR",
    "GBP",
)

LOW_STOCK_PATTERN = re.compile(
    r"(only\s+\d+\s+(left|remaining|in\s+stock)|low\s+stock|almost\s+gone|"
    r"selling\s+fast|limited\s+stock|few\s+left|limited\s+quantit)",
    re.IGNORECASE,
)

CHALLENGE_STATUS_CODES = {401, 403, 429, 503}
CHALLENGE_TITLE_MARKERS = (
    "access denied",
    "just a moment",
    "attention required",
    "are you a robot",
    "verify you are human",
    "security check",
    "pardon our interruption",
    "request blocked",
)

logger = logging.getLogger("live_scraper")


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class ScrapeSkipped(Exception):
    """Base class for conditions where a URL is skipped on purpose."""


class RobotsDisallowed(ScrapeSkipped):
    """robots.txt disallows the URL for our user agent."""


class BlockedByChallenge(ScrapeSkipped):
    """The site served a bot-protection / CAPTCHA page. We do not bypass it."""


# ---------------------------------------------------------------------------
# Parsing & Filtering Helpers
# ---------------------------------------------------------------------------


def parse_usd_price(value: Any) -> Optional[float]:
    """
    Normalize a raw price (e.g. "$24.99", "USD 1,299.00", 24.99) to a USD float.
    Returns None for missing, unparseable, non-positive, or non-USD values.
    """
    if value is None or isinstance(value, bool):
        return None

    if isinstance(value, (int, float)):
        price = float(value)
        return round(price, 2) if price > 0 else None

    text = str(value).strip()
    if not text:
        return None

    upper = text.upper()
    if any(marker.upper() in upper for marker in NON_USD_MARKERS):
        return None

    cleaned = (
        upper.replace("USD", "")
        .replace("US$", "")
        .replace("$", "")
        .replace(",", "")
        .strip()
    )
    match = re.search(r"\d+(?:\.\d+)?", cleaned)
    if not match:
        return None

    price = float(match.group(0))
    return round(price, 2) if price > 0 else None


def normalize_availability(raw: Any) -> str:
    """Map schema.org / free-text availability to the engine's stock vocabulary."""
    if raw is None:
        return "Unknown"
    text = str(raw).strip().lower()
    if not text:
        return "Unknown"

    token = text.rsplit("/", 1)[-1].replace(" ", "").replace("_", "")

    if token in {"limitedavailability", "lowstock"} or LOW_STOCK_PATTERN.search(text):
        return "Low Stock"
    if token in {
        "outofstock",
        "soldout",
        "discontinued",
        "unavailable",
        "backorder",
        "preorder",
        "presale",
    }:
        return "Out of Stock"
    if "sold out" in text or "out of stock" in text:
        return "Out of Stock"
    if token in {"instock", "instoreonly", "onlineonly", "available"} or "in stock" in text:
        return "In Stock"
    return "Unknown"


def title_matches(title: str, required_terms: Optional[Sequence[str]] = None) -> bool:
    """Optional keyword filter; returns True when required_terms is empty/None."""
    if not required_terms:
        return True
    lowered = (title or "").lower()
    return all(term.lower() in lowered for term in required_terms)


def is_bundle_listing(title: str) -> bool:
    """True if the title indicates a bundle / multi-pack (see BUNDLE_EXCLUSION_KEYWORDS)."""
    return bool(BUNDLE_PATTERN.search(title or ""))


def is_non_merchandise(title: str, product_type: str = "") -> bool:
    """True if the listing is a gift card, warranty, or shipping protection item."""
    combined = f"{title or ''} {product_type or ''}"
    return bool(NON_MERCHANDISE_PATTERN.search(combined))


def _iter_jsonld_nodes(payload: Any) -> Iterable[Dict[str, Any]]:
    """Yield every JSON object inside a JSON-LD payload (handles lists and @graph)."""
    if isinstance(payload, list):
        for item in payload:
            yield from _iter_jsonld_nodes(item)
    elif isinstance(payload, dict):
        yield payload
        graph = payload.get("@graph")
        if graph is not None:
            yield from _iter_jsonld_nodes(graph)


def _has_type(node: Dict[str, Any], type_name: str) -> bool:
    node_type = node.get("@type")
    if isinstance(node_type, list):
        return type_name in node_type
    return node_type == type_name


def extract_jsonld_product(soup: BeautifulSoup) -> Optional[Dict[str, Any]]:
    """
    Extract name / price / currency / availability from schema.org JSON-LD.
    Supports Product, ProductGroup (hasVariant), Offer, and AggregateOffer shapes.
    """
    for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
        raw = script.string or script.get_text() or ""
        if not raw.strip():
            continue
        try:
            payload = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            continue

        for node in _iter_jsonld_nodes(payload):
            if not (_has_type(node, "Product") or _has_type(node, "ProductGroup")):
                continue

            name = node.get("name")
            offers = node.get("offers")
            if offers is None and isinstance(node.get("hasVariant"), list) and node["hasVariant"]:
                offers = node["hasVariant"][0].get("offers")

            if isinstance(offers, list):
                offers = offers[0] if offers else None
            if not isinstance(offers, dict):
                continue

            nested = offers.get("offers")
            if isinstance(nested, list) and nested and isinstance(nested[0], dict):
                offer = nested[0]
            elif isinstance(nested, dict):
                offer = nested
            else:
                offer = offers

            price_spec = offer.get("priceSpecification") or {}
            if isinstance(price_spec, list):
                price_spec = price_spec[0] if price_spec else {}

            price = (
                offer.get("price")
                or offers.get("lowPrice")
                or (price_spec.get("price") if isinstance(price_spec, dict) else None)
            )
            currency = (
                offer.get("priceCurrency")
                or offers.get("priceCurrency")
                or (price_spec.get("priceCurrency") if isinstance(price_spec, dict) else None)
            )
            availability = offer.get("availability") or offers.get("availability")

            return {
                "name": name,
                "price": price,
                "currency": currency,
                "availability": availability,
            }
    return None


def extract_meta_price(soup: BeautifulSoup) -> Dict[str, Optional[str]]:
    """Fallback: Open Graph / product meta tags and schema.org microdata."""

    def meta(*keys: str) -> Optional[str]:
        for key in keys:
            tag = soup.find("meta", attrs={"property": key}) or soup.find(
                "meta", attrs={"name": key}
            )
            if tag and tag.get("content"):
                return tag["content"].strip()
        return None

    price = meta("product:price:amount", "og:price:amount")
    currency = meta("product:price:currency", "og:price:currency")
    availability = meta("product:availability", "og:availability")

    if price is None:
        tag = soup.find(attrs={"itemprop": "price"})
        if tag:
            price = tag.get("content") or tag.get_text(strip=True)
    if currency is None:
        tag = soup.find(attrs={"itemprop": "priceCurrency"})
        if tag:
            currency = tag.get("content") or tag.get_text(strip=True)
    if availability is None:
        tag = soup.find(attrs={"itemprop": "availability"})
        if tag:
            availability = tag.get("href") or tag.get("content") or tag.get_text(strip=True)

    title = meta("og:title")
    if title is None:
        h1 = soup.find("h1")
        title = h1.get_text(strip=True) if h1 else None

    return {"title": title, "price": price, "currency": currency, "availability": availability}


def detect_low_stock_text(soup: BeautifulSoup) -> bool:
    """Scan only stock/inventory widgets and the add-to-cart form for low-stock copy."""
    selectors = (
        '[class*="inventory"], [id*="inventory"], '
        '[class*="stock"], [id*="stock"], '
        'form[action*="/cart/add"]'
    )
    for element in soup.select(selectors):
        if LOW_STOCK_PATTERN.search(element.get_text(" ", strip=True)):
            return True
    return False


def is_challenge_page(response: requests.Response) -> bool:
    if response.status_code in CHALLENGE_STATUS_CODES:
        return True
    content_type = response.headers.get("Content-Type", "")
    if "html" not in content_type:
        return False
    title_match = re.search(
        r"<title[^>]*>(.*?)</title>", response.text[:5000], re.IGNORECASE | re.DOTALL
    )
    title = title_match.group(1).strip().lower() if title_match else ""
    return any(marker in title for marker in CHALLENGE_TITLE_MARKERS)


# ---------------------------------------------------------------------------
# HTTP Client
# ---------------------------------------------------------------------------


class PoliteUSClient:
    """requests.Session wrapper: US headers, retries, timeouts, robots.txt, rate limits."""

    def __init__(self, delay_seconds: float = DEFAULT_DELAY_SECONDS) -> None:
        self.delay_seconds = max(0.5, delay_seconds)
        self.session = self._build_session()
        self._robots: Dict[str, robotparser.RobotFileParser] = {}
        self._unreachable: set = set()
        self._last_request_at: Dict[str, float] = {}

    @staticmethod
    def _build_session() -> requests.Session:
        session = requests.Session()
        session.headers.update(US_HEADERS)
        for name, value in US_COOKIES.items():
            session.cookies.set(name, value)

        retry = Retry(
            total=2,
            connect=2,
            read=2,
            backoff_factor=0.8,
            status_forcelist=(429, 500, 502, 503, 504),
            allowed_methods=frozenset({"GET", "HEAD"}),
            respect_retry_after_header=True,
            raise_on_status=False,
        )
        adapter = HTTPAdapter(max_retries=retry, pool_connections=8, pool_maxsize=8)
        session.mount("https://", adapter)
        session.mount("http://", adapter)
        return session

    def _throttle(self, host: str) -> None:
        last = self._last_request_at.get(host)
        if last is not None:
            wait = self.delay_seconds - (time.monotonic() - last)
            if wait > 0:
                time.sleep(wait)
        self._last_request_at[host] = time.monotonic()

    def _robots_for(self, url: str) -> robotparser.RobotFileParser:
        parsed = urlparse(url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        if origin in self._robots:
            return self._robots[origin]

        parser = robotparser.RobotFileParser()
        robots_url = f"{origin}/robots.txt"
        try:
            self._throttle(parsed.netloc)
            resp = self.session.get(robots_url, timeout=REQUEST_TIMEOUT)
            if resp.status_code == 200:
                parser.parse(resp.text.splitlines())
            elif resp.status_code in (401, 403):
                parser.disallow_all = True
            else:
                parser.allow_all = True
        except requests.RequestException as exc:
            logger.warning("robots.txt unreachable for %s (%s); skipping host.", origin, exc)
            parser.disallow_all = True
            self._unreachable.add(origin)

        self._robots[origin] = parser
        return parser

    def get(self, url: str) -> requests.Response:
        if not self._robots_for(url).can_fetch(US_HEADERS["User-Agent"], url):
            parsed = urlparse(url)
            if f"{parsed.scheme}://{parsed.netloc}" in self._unreachable:
                raise requests.ConnectionError(f"host unreachable: {parsed.netloc}")
            raise RobotsDisallowed(f"robots.txt disallows {url}")

        self._throttle(urlparse(url).netloc)
        response = self.session.get(url, timeout=REQUEST_TIMEOUT, allow_redirects=True)

        if is_challenge_page(response):
            raise BlockedByChallenge(
                f"{url} returned a bot-protection page (HTTP {response.status_code}); skipping."
            )
        response.raise_for_status()
        return response

    def get_json(self, url: str) -> Any:
        response = self.get(url)
        try:
            return response.json()
        except ValueError as exc:
            raise ValueError(f"Non-JSON response from {url}") from exc

    def get_soup(self, url: str) -> BeautifulSoup:
        return BeautifulSoup(self.get(url).text, "html.parser")


# ---------------------------------------------------------------------------
# Source Adapters
# ---------------------------------------------------------------------------


@dataclass
class ScrapedProduct:
    product_name: str
    retail_price: float
    stock_status: str
    source_url: str
    category: str = "Health & Wellness"


def _shopify_store_currency(client: PoliteUSClient, base_url: str) -> Optional[str]:
    """Shopify's public /meta.json reports the storefront's base currency."""
    try:
        meta = client.get_json(f"{base_url}/meta.json")
    except (ScrapeSkipped, requests.RequestException, ValueError) as exc:
        logger.debug("meta.json unavailable for %s: %s", base_url, exc)
        return None
    currency = meta.get("currency") if isinstance(meta, dict) else None
    return str(currency).upper() if currency else None


def _shopify_variant_stock(variants: List[Dict[str, Any]]) -> str:
    if not variants:
        return "Unknown"

    flags = [v.get("available") for v in variants if "available" in v]
    quantities = [
        v.get("inventory_quantity")
        for v in variants
        if isinstance(v.get("inventory_quantity"), (int, float))
    ]

    if quantities:
        total = sum(q for q in quantities if q > 0)
        if total <= 0:
            return "Out of Stock"
        if total <= LOW_STOCK_UNITS:
            return "Low Stock"
        return "In Stock"

    if not flags:
        return "Unknown"
    if not any(flags):
        return "Out of Stock"
    if not all(flags):
        return "Low Stock"  # some variants (sizes/flavors) are already sold out
    return "In Stock"


def scrape_shopify_store_catalog(
    client: PoliteUSClient,
    base_url: str,
    category: str,
    per_store_limit: int = DEFAULT_PRODUCTS_PER_STORE,
    required_terms: Optional[Sequence[str]] = None,
    verify_html: bool = False,
) -> List[ScrapedProduct]:
    """
    Broad catalog scraper: hits `/products.json` for a US Shopify store and pulls
    the first `per_store_limit` (5-10) valid, in-stock, non-bundle products,
    tagging each with the store's `category`.
    """
    base_url = base_url.rstrip("/")
    host = urlparse(base_url).netloc
    store_currency = _shopify_store_currency(client, base_url)

    if store_currency and store_currency != "USD":
        logger.info("Skipping %s: storefront currency is %s, not USD.", host, store_currency)
        return []

    url = f"{base_url}/products.json?limit=250&page=1"
    try:
        payload = client.get_json(url)
    except ScrapeSkipped as exc:
        logger.info("Skipping %s: %s", host, exc)
        return []
    except (requests.RequestException, ValueError) as exc:
        logger.info("Skipping %s: not a reachable Shopify catalog (%s).", host, exc)
        return []

    products = payload.get("products") if isinstance(payload, dict) else None
    if not products:
        logger.info("No products returned at %s.", host)
        return []

    results: List[ScrapedProduct] = []
    for product in products:
        if len(results) >= per_store_limit:
            break

        title = (product.get("title") or "").strip()
        handle = product.get("handle")
        product_type = (product.get("product_type") or "").strip()
        variants = product.get("variants") or []

        if not title or not handle or not variants:
            continue

        # 1. Optional keyword filter (disabled by default in broad catalog mode)
        if required_terms and not title_matches(title, required_terms):
            continue

        # 2. Bundle / multi-pack exclusion filter
        if is_bundle_listing(title):
            logger.debug("Excluded bundle/multi-pack at %s: %r", host, title)
            continue

        # 3. Skip gift cards / warranties / shipping protection
        if is_non_merchandise(title, product_type):
            continue

        # 4. Require active, in-stock (or low-stock) availability
        stock_status = _shopify_variant_stock(variants)
        if stock_status not in ("In Stock", "Low Stock"):
            continue

        # 5. Parse USD price from the first available variant
        available_variants = [v for v in variants if v.get("available")]
        primary = available_variants[0] if available_variants else variants[0]
        price = parse_usd_price(primary.get("price"))
        if price is None or price < 3.0:
            continue

        product_url = f"{base_url}/products/{handle}"

        # Optional HTML verification when store meta.json did not explicitly confirm USD
        page_currency: Optional[str] = None
        if verify_html or store_currency is None:
            try:
                soup = client.get_soup(product_url)
                jsonld = extract_jsonld_product(soup) or {}
                page_currency = (jsonld.get("currency") or "").upper() or None
                if stock_status == "In Stock" and detect_low_stock_text(soup):
                    stock_status = "Low Stock"
            except (ScrapeSkipped, requests.RequestException):
                # Default to USD for .com US Shopify storefronts when product HTML is rate-limited
                page_currency = "USD"

        currency = store_currency or page_currency or "USD"
        if currency != "USD":
            logger.info("Skipping %r at %s: currency=%s is not USD.", title, host, currency)
            continue

        results.append(
            ScrapedProduct(
                product_name=title,
                retail_price=price,
                stock_status=stock_status,
                source_url=product_url,
                category=category,
            )
        )
        logger.info(
            "[%s] Captured %r at %s: $%.2f (%s).",
            category,
            title,
            host,
            price,
            stock_status,
        )

    return results


def scrape_generic_product_page(
    client: PoliteUSClient,
    url: str,
    category: str = "Health & Wellness",
) -> Optional[ScrapedProduct]:
    """Non-Shopify product page via JSON-LD + meta tags."""
    try:
        soup = client.get_soup(url)
    except ScrapeSkipped as exc:
        logger.info("Skipping %s: %s", url, exc)
        return None
    except requests.RequestException as exc:
        logger.warning("Request failed for %s: %s", url, exc)
        return None

    jsonld = extract_jsonld_product(soup) or {}
    meta = extract_meta_price(soup)

    title = (jsonld.get("name") or meta.get("title") or "").strip()
    raw_price = jsonld.get("price") or meta.get("price")
    currency = (jsonld.get("currency") or meta.get("currency") or "").upper()
    availability = jsonld.get("availability") or meta.get("availability")

    if not title or raw_price is None:
        logger.info("Skipping %s: product title or price element missing.", url)
        return None
    if is_bundle_listing(title):
        logger.info("Excluded bundle/multi-pack: %r (%s)", title, url)
        return None
    if currency and currency != "USD":
        logger.info("Skipping %s: currency %s is not USD.", url, currency)
        return None

    price = parse_usd_price(raw_price)
    if price is None:
        logger.info("Skipping %s: unparseable price %r.", url, raw_price)
        return None

    stock_status = normalize_availability(availability)
    if stock_status == "In Stock" and detect_low_stock_text(soup):
        stock_status = "Low Stock"

    return ScrapedProduct(title, price, stock_status, url, category=category)


# ---------------------------------------------------------------------------
# Pipeline
# ---------------------------------------------------------------------------


def to_engine_schema(products: List[ScrapedProduct]) -> List[Dict[str, Any]]:
    """
    Dedupe by title and map to the Newsvendor engine's input schema,
    generating category-specific SKU IDs (`LIVE-HLTH-001`, `LIVE-PET-001`, `LIVE-ATH-001`).
    """
    records: List[Dict[str, Any]] = []
    seen: set = set()
    category_counts: Dict[str, int] = {}

    for product in products:
        key = product.product_name.lower()
        if key in seen:
            continue
        seen.add(key)

        cat = product.category or "Health & Wellness"
        prefix = CATEGORY_SKU_PREFIX.get(cat, "LIVE-SKU")
        category_counts[cat] = category_counts.get(cat, 0) + 1
        sku_id = f"{prefix}-{category_counts[cat]:03d}"

        retail_price = round(float(product.retail_price), 2)
        records.append(
            {
                "sku_id": sku_id,
                "product_name": product.product_name,
                "category": cat,
                "unit_cost": round(retail_price * UNIT_COST_RATIO, 2),
                "retail_price": retail_price,
                "stock_status": product.stock_status,
            }
        )
    return records


def scrape_live_signals(
    stores_by_category: Optional[Dict[str, List[str]]] = None,
    per_store_limit: int = DEFAULT_PRODUCTS_PER_STORE,
    max_per_category: int = 10,
    delay_seconds: float = DEFAULT_DELAY_SECONDS,
    required_terms: Optional[Sequence[str]] = None,
) -> Tuple[List[Dict[str, Any]], List[ScrapedProduct]]:
    """
    Iterate across all three categories (`Health & Wellness`, `Pet Supplies`,
    `Athletic Gear`), pull the top active non-bundle products from each Shopify
    store's `/products.json`, and return `(engine_records, provenance)`.
    """
    client = PoliteUSClient(delay_seconds=delay_seconds)
    catalog_map = stores_by_category or TARGET_STORES_BY_CATEGORY

    collected: List[ScrapedProduct] = []

    for category, stores in catalog_map.items():
        cat_products: List[ScrapedProduct] = []
        logger.info("=== Category: %s ===", category)

        for store_url in stores:
            if len(cat_products) >= max_per_category:
                break
            remaining = max_per_category - len(cat_products)
            fetch_limit = min(per_store_limit, remaining)

            logger.info("Scanning %s catalog: %s (target=%d)", category, store_url, fetch_limit)
            try:
                items = scrape_shopify_store_catalog(
                    client=client,
                    base_url=store_url,
                    category=category,
                    per_store_limit=fetch_limit,
                    required_terms=required_terms,
                )
                cat_products.extend(items)
            except Exception as exc:
                logger.exception("Unexpected error scraping %s: %s", store_url, exc)

        collected.extend(cat_products)

    # Deduplicate while preserving order so provenance aligns 1-to-1 with records
    unique: List[ScrapedProduct] = []
    seen: set = set()
    for product in collected:
        key = product.product_name.lower()
        if key not in seen:
            seen.add(key)
            unique.append(product)

    return to_engine_schema(unique), unique


def _parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Dynamic multi-category US Shopify scraper for the Arbitrage Engine."
    )
    parser.add_argument(
        "--category",
        action="append",
        dest="categories",
        choices=list(TARGET_STORES_BY_CATEGORY.keys()),
        help="Scrape only the specified category (repeatable). Defaults to all 3 categories.",
    )
    parser.add_argument(
        "--per-store",
        type=int,
        default=DEFAULT_PRODUCTS_PER_STORE,
        help=f"Number of in-stock non-bundle products to pull per store (default: {DEFAULT_PRODUCTS_PER_STORE}).",
    )
    parser.add_argument(
        "--max-per-category",
        type=int,
        default=10,
        help="Maximum products to collect per category (default: 10).",
    )
    parser.add_argument(
        "--terms",
        default="",
        help="Optional comma-separated title keywords filter (default: none / broad catalog).",
    )
    parser.add_argument("--delay", type=float, default=DEFAULT_DELAY_SECONDS)
    parser.add_argument("--json-out", help="Optional path to write the records as JSON.")
    parser.add_argument("-v", "--verbose", action="store_true")
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = _parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%H:%M:%S",
    )

    if args.categories:
        selected_map = {
            cat: TARGET_STORES_BY_CATEGORY[cat]
            for cat in args.categories
            if cat in TARGET_STORES_BY_CATEGORY
        }
    else:
        selected_map = TARGET_STORES_BY_CATEGORY

    required_terms = (
        tuple(t.strip().lower() for t in args.terms.split(",") if t.strip())
        if args.terms
        else None
    )

    records, provenance = scrape_live_signals(
        stores_by_category=selected_map,
        per_store_limit=max(1, args.per_store),
        max_per_category=max(1, args.max_per_category),
        delay_seconds=args.delay,
        required_terms=required_terms,
    )

    if not records:
        logger.warning("No live records collected across the target stores.")
        return 1

    pd.set_option("display.max_columns", None)
    pd.set_option("display.width", 220)
    pd.set_option("display.max_colwidth", 52)

    df = pd.DataFrame(
        records,
        columns=["sku_id", "product_name", "category", "unit_cost", "retail_price", "stock_status"],
    )
    print("\n=== Live US Market Signals (Multi-Category Bulk Scrape) ===")
    print(df.to_string(index=False))

    print("\nCategory Breakdown:")
    for cat, count in df["category"].value_counts().items():
        print(f"  - {cat}: {count} SKUs")

    print("\nSources:")
    for record, source in zip(records, provenance):
        print(f"  {record['sku_id']} [{record['category']}]: {source.source_url}")

    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8") as handle:
            json.dump(records, handle, indent=2)
        print(f"\nWrote {len(records)} records to {args.json_out}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
