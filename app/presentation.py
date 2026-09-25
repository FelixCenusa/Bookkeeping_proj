"""Display helpers for the customer-facing templates.

These only change how values are shown; they never feed back into pricing,
availability, or form handling.
"""

import re
from datetime import date
from decimal import Decimal, InvalidOperation

NBSP = " "

_DIMENSIONS_PATTERN = re.compile(r"(\d+(?:[.,]\d+)?)\s*[×xX]\s*(\d+(?:[.,]\d+)?)")

_SWEDISH_MONTHS = (
    "jan", "feb", "mars", "apr", "maj", "juni",
    "juli", "aug", "sep", "okt", "nov", "dec",
)


def _field(obj, name):
    if isinstance(obj, dict):
        return obj.get(name)
    return getattr(obj, name, None)


def format_sek(value):
    """Format an amount the Swedish way: 2599.00 -> '2 599 kr', 19.5 -> '19,50 kr'."""
    if value is None or value == "":
        return ""
    try:
        amount = Decimal(str(value)).quantize(Decimal("0.01"))
    except (InvalidOperation, ValueError):
        return f"{value}{NBSP}kr"

    if amount == amount.to_integral_value():
        digits = f"{int(amount):,}".replace(",", NBSP)
    else:
        digits = f"{amount:,.2f}".replace(",", "_").replace(".", ",").replace("_", NBSP)
    return f"{digits}{NBSP}kr"


def tent_dimensions(category):
    """Parse '6×10 m' out of a tent's display name. Returns {'width', 'length'} or None."""
    name = _field(category, "display_name") or ""
    match = _DIMENSIONS_PATTERN.search(str(name))
    if not match:
        return None
    first, second = (float(part.replace(",", ".")) for part in match.groups())
    width, length = sorted((first, second))
    return {
        "width": int(width) if width.is_integer() else width,
        "length": int(length) if length.is_integer() else length,
    }


def _tent_area(category):
    area = _field(category, "floor_area_m2")
    if area:
        try:
            return float(area)
        except (TypeError, ValueError):
            pass
    dims = tent_dimensions(category)
    if dims:
        return float(dims["width"]) * float(dims["length"])
    return float("inf")


def catalog_order(categories):
    """Tents first, smallest to largest by floor area, then everything else by name."""
    if not categories:
        return categories

    def sort_key(category):
        name = str(_field(category, "display_name") or "").casefold()
        if _field(category, "is_tent"):
            return (0, _tent_area(category), name)
        return (1, 0.0, name)

    return sorted(categories, key=sort_key)


def swedish_date_range(start, end):
    """'2026-10-02', '2026-10-05' -> '2–5 okt'; spans months/years as needed."""
    try:
        start_date = start if isinstance(start, date) else date.fromisoformat(str(start))
        end_date = end if isinstance(end, date) else date.fromisoformat(str(end))
    except (TypeError, ValueError):
        return ""

    def month(value):
        return _SWEDISH_MONTHS[value.month - 1]

    year_suffix = "" if end_date.year == date.today().year else f" {end_date.year}"
    if start_date.year != end_date.year:
        return (
            f"{start_date.day} {month(start_date)} {start_date.year}"
            f" – {end_date.day} {month(end_date)} {end_date.year}"
        )
    if start_date.month != end_date.month:
        return f"{start_date.day} {month(start_date)} – {end_date.day} {month(end_date)}{year_suffix}"
    if start_date.day == end_date.day:
        return f"{start_date.day} {month(start_date)}{year_suffix}"
    return f"{start_date.day}–{end_date.day} {month(end_date)}{year_suffix}"


def register_template_filters(app):
    app.jinja_env.filters["sek"] = format_sek
    app.jinja_env.filters["tent_dimensions"] = tent_dimensions
    app.jinja_env.filters["catalog_order"] = catalog_order
    app.jinja_env.filters["swedish_date_range"] = swedish_date_range
