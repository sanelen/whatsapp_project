#!/usr/bin/env python3
"""Generate compact, shareable Hamba property advert PDFs."""

from io import BytesIO
from pathlib import Path

from PIL import Image
from reportlab.lib.colors import Color, HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
MARKETING = ROOT / "public" / "marketing"
PAGE_W, PAGE_H = A4


PROPERTIES = [
    {
        "slug": "hamba-essex-advert",
        "brand": "HAMBA ESSEX",
        "strapline": "STUDIO APARTMENTS",
        "area": "BULWER / BEREA, DURBAN",
        "address": "33 Essex Road, Bulwer, Berea, Durban, 4083",
        "price": "ASK US TO CONFIRM THE CURRENT ROOM PRICE",
        "deposit": "Deposit and lease term confirmed for the selected room",
        "profile": "hamba-essex-profile.png",
        "hero": "33-essex-exterior.jpg",
        "room": "33-essex-room-layout.jpg",
        "detail": "33-essex-kitchenette.jpg",
        "photos": "https://photos.app.goo.gl/kMR2VEfBo4EXLZJQA",
        "accent": "#d4aa64",
        "highlights": [
            "Studio and en-suite rental options",
            "Free Wi-Fi included",
            "Private kitchenette options shown in the portfolio",
            "Parking is very limited and allocated in writing",
        ],
        "fit": "Staff confirms price, deposit, lease term, household fit and availability before payment.",
        "property_facts": [
            "Free Wi-Fi is included.",
            "Private bathroom, kitchen area, hot water and secure access are recorded features.",
            "There is no shared kitchen.",
            "Parking is very limited and only available when management allocates a bay in writing.",
        ],
        "confirm_before_viewing": [
            "The current available room, final rent and matching deposit.",
            "The exact room layout, kitchenette and utility arrangement.",
            "The number of occupants allowed in the selected room.",
            "Children rules and whether a parking bay is available for that room.",
        ],
        "household_note": "Prices, occupancy and some rules vary by room. Staff must confirm the selected room before a viewing or payment.",
    },
    {
        "slug": "hamba-quarry-heights-advert",
        "brand": "HAMBA QUARRY HEIGHTS",
        "strapline": "STUDIO & EN-SUITE APARTMENTS",
        "area": "NEWLANDS EAST, DURBAN",
        "address": "28 Nkunzana Grove, Newlands East, 4037",
        "price": "R2,200 PER MONTH",
        "deposit": "Current documented deposit baseline: R2,200",
        "profile": "hamba-quarry-heights-profile.png",
        "hero": "quarry-heights-exterior.jpg",
        "room": "quarry-heights-studio.jpg",
        "detail": "quarry-heights-bathroom.jpg",
        "photos": "https://photos.app.goo.gl/56RH6eEDm8tBMWxo8",
        "accent": "#c88743",
        "highlights": [
            "Free Wi-Fi included",
            "Maximum two occupants per unit",
            "No tenant or guest parking",
            "Private en-suite examples shown in the portfolio",
        ],
        "fit": "Current lease rules do not allow children under 12. Ask staff about ages 12-15 before viewing.",
        "property_facts": [
            "Free Wi-Fi is included and units have private en-suite facilities.",
            "The current documented baseline is R2,200 rent and a R2,200 refundable deposit.",
            "A maximum of two occupants is allowed per unit.",
            "No parking is available for tenants or guests, and there is no shared kitchen.",
        ],
        "confirm_before_viewing": [
            "The current available unit and intended move-in date.",
            "The full household: adults plus the ages of any children.",
            "Children under 12 are not permitted; ages 12-15 require staff confirmation.",
            "Any unit-specific utility, layout or washing-area details.",
        ],
        "household_note": "Quarry Heights is managed as a peaceful environment. Current operational guidance does not allow parties.",
    },
    {
        "slug": "hamba-westrich-advert",
        "brand": "HAMBA WESTRICH",
        "strapline": "STUDIO & EN-SUITE APARTMENTS",
        "area": "NEWLANDS WEST, DURBAN",
        "address": "House No. 10, 109585 St, Earlsfield, Newlands West, 4037",
        "price": "FROM R1,900 PER MONTH",
        "deposit": "Recorded deposit baseline: R1,400 - confirm selected room",
        "profile": "hamba-westrich-profile.png",
        "hero": "westrich-exterior.jpg",
        "room": "westrich-studio.jpg",
        "detail": "westrich-ensuite.jpg",
        "photos": "https://photos.app.goo.gl/xwUqocDcoAvnMpmW8",
        "accent": "#89aeb8",
        "highlights": [
            "Studio and en-suite rental options",
            "One or two occupants, depending on the room",
            "Private en-suite examples shown in the portfolio",
            "Parking is very limited and never guaranteed",
        ],
        "fit": "Confirm the selected room's price, deposit, occupancy and household fit with staff before viewing or payment.",
        "property_facts": [
            "Rent is documented from R1,900; the recorded deposit baseline is R1,400.",
            "Rooms accommodate one or two occupants, depending on the room.",
            "Recorded features include prepaid electricity, hot water, secure access and a shared washing area.",
            "Parking is very limited, never guaranteed, and there is no shared kitchen.",
        ],
        "confirm_before_viewing": [
            "The available room, final rent and deposit for that room.",
            "Whether the room is approved for one or two occupants.",
            "The exact water, electricity, kitchenette and en-suite arrangement.",
            "Household fit, children rules and whether any parking can be allocated.",
        ],
        "household_note": "Wi-Fi and a blanket children rule are not confirmed for Westrich, so staff must check these rather than promise them.",
    },
]


def image_crop(path: Path, width: int, height: int) -> ImageReader:
    with Image.open(path) as source:
        image = source.convert("RGB")
        scale = max(width / image.width, height / image.height)
        resized = image.resize((round(image.width * scale), round(image.height * scale)), Image.Resampling.LANCZOS)
        left = max(0, (resized.width - width) // 2)
        top = max(0, (resized.height - height) // 2)
        cropped = resized.crop((left, top, left + width, top + height))
        stream = BytesIO()
        cropped.save(stream, format="JPEG", quality=90, optimize=True)
        stream.seek(0)
        return ImageReader(stream)


def draw_wrapped(
    c: canvas.Canvas,
    text: str,
    x: float,
    y: float,
    max_width: float,
    size: float,
    leading: float,
    color,
    font: str = "Helvetica",
) -> float:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and stringWidth(candidate, font, size) > max_width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    c.setFillColor(color)
    c.setFont(font, size)
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def draw_cover(c: canvas.Canvas, path: Path, x: float, y: float, width: float, height: float) -> None:
    reader = image_crop(path, round(width * 2), round(height * 2))
    c.drawImage(reader, x, y, width=width, height=height, preserveAspectRatio=False, mask="auto")


def draw_bullets(
    c: canvas.Canvas,
    items: list[str],
    x: float,
    y: float,
    max_width: float,
    accent,
    color,
    size: float = 8.4,
    leading: float = 11.2,
) -> float:
    for item in items:
        c.setFillColor(accent)
        c.circle(x + 4, y + 3, 2.5, fill=1, stroke=0)
        y = draw_wrapped(c, item, x + 14, y, max_width - 14, size, leading, color) - 5
    return y


def draw_panel(c: canvas.Canvas, x: float, y: float, width: float, height: float, accent) -> None:
    c.setFillColor(HexColor("#12110f"))
    c.roundRect(x, y, width, height, 10, fill=1, stroke=0)
    c.setStrokeColor(Color(accent.red, accent.green, accent.blue, alpha=0.45))
    c.roundRect(x, y, width, height, 10, fill=0, stroke=1)


def draw_detail_page(c: canvas.Canvas, data: dict[str, object]) -> None:
    accent = HexColor(str(data["accent"]))
    cream = HexColor("#f5e4c5")
    ink = HexColor("#11100e")
    muted = HexColor("#b9aea0")
    body = HexColor("#e8dfd3")

    c.setFillColor(HexColor("#090807"))
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    for offset in range(-500, 1000, 24):
        c.setStrokeColor(Color(1, 1, 1, alpha=0.025))
        c.line(offset, 0, offset + 500, PAGE_H)

    # Guide header
    c.drawImage(str(MARKETING / str(data["profile"])), 34, PAGE_H - 82, 46, 46, mask="auto")
    c.setFillColor(accent)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(94, PAGE_H - 48, str(data["brand"]))
    c.setFillColor(cream)
    c.setFont("Helvetica-Bold", 25)
    c.drawString(94, PAGE_H - 75, "YOUR PROPERTY GUIDE")
    c.setFillColor(muted)
    c.setFont("Helvetica", 8)
    c.drawRightString(PAGE_W - 34, PAGE_H - 51, "PAGE 2 OF 2")
    c.drawRightString(PAGE_W - 34, PAGE_H - 67, str(data["area"]))
    c.setStrokeColor(Color(accent.red, accent.green, accent.blue, alpha=0.5))
    c.line(34, PAGE_H - 99, PAGE_W - 34, PAGE_H - 99)

    # Property-specific facts and confirmation gates
    card_y = PAGE_H - 326
    card_h = 205
    gap = 14
    card_w = (PAGE_W - 68 - gap) / 2
    draw_panel(c, 34, card_y, card_w, card_h, accent)
    draw_panel(c, 34 + card_w + gap, card_y, card_w, card_h, accent)

    c.setFillColor(accent)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(50, card_y + card_h - 24, "WHAT THIS PROPERTY OFFERS")
    draw_bullets(c, list(data["property_facts"]), 48, card_y + card_h - 47, card_w - 28, accent, body)

    right_x = 34 + card_w + gap
    c.setFillColor(accent)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(right_x + 16, card_y + card_h - 24, "CONFIRM BEFORE VIEWING")
    draw_bullets(
        c,
        list(data["confirm_before_viewing"]),
        right_x + 14,
        card_y + card_h - 47,
        card_w - 28,
        accent,
        body,
    )

    # Application checklist
    checklist_y = card_y - 177
    checklist_h = 157
    draw_panel(c, 34, checklist_y, PAGE_W - 68, checklist_h, accent)
    c.setFillColor(accent)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(50, checklist_y + checklist_h - 24, "APPLICATION CHECKLIST")
    c.setFillColor(muted)
    c.setFont("Helvetica", 7.5)
    c.drawString(190, checklist_y + checklist_h - 24, "Send documents only after staff confirms the property and household fit.")

    application_left = [
        "Clear copy or photo of South African ID or passport",
        "Three months bank statements",
        "Applicant's full name and main contact number",
    ]
    application_right = [
        "Intended move-in date and selected property or room",
        "Number and names of all occupants",
        "Parking requirement, even where parking is unavailable",
    ]
    draw_bullets(c, application_left, 48, checklist_y + checklist_h - 52, 238, accent, body, 8.2, 10.8)
    draw_bullets(c, application_right, 307, checklist_y + checklist_h - 52, 238, accent, body, 8.2, 10.8)
    c.setFillColor(Color(accent.red, accent.green, accent.blue, alpha=0.14))
    c.roundRect(49, checklist_y + 14, PAGE_W - 98, 31, 6, fill=1, stroke=0)
    draw_wrapped(
        c,
        "Proof of income or a latest payslip may be requested during review. Sending documents does not approve the application or reserve a room.",
        61,
        checklist_y + 33,
        PAGE_W - 122,
        7.7,
        10,
        body,
    )

    # Process steps
    process_y = checklist_y - 145
    c.setFillColor(accent)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(34, process_y + 121, "FROM ENQUIRY TO MOVE-IN")
    process_steps = [
        ("1", "BROWSE", "Review photos and select a property."),
        ("2", "CHECK FIT", "Share budget, move-in date and household."),
        ("3", "VIEW", "Wait for a confirmed date before travelling."),
        ("4", "APPLY", "Submit the requested documents for review."),
        ("5", "SECURE", "Use only current written payment instructions."),
    ]
    step_gap = 8
    step_w = (PAGE_W - 68 - step_gap * 4) / 5
    for index, (number, title, description) in enumerate(process_steps):
        x = 34 + index * (step_w + step_gap)
        draw_panel(c, x, process_y, step_w, 102, accent)
        c.setFillColor(accent)
        c.circle(x + 16, process_y + 82, 9, fill=1, stroke=0)
        c.setFillColor(ink)
        c.setFont("Helvetica-Bold", 8)
        c.drawCentredString(x + 16, process_y + 79, number)
        c.setFillColor(cream)
        c.setFont("Helvetica-Bold", 7.8)
        c.drawString(x + 31, process_y + 79, title)
        draw_wrapped(c, description, x + 11, process_y + 58, step_w - 22, 7.1, 9.2, body)

    # Safe payment and contact footer
    warning_y = 83
    c.setFillColor(accent)
    c.roundRect(34, warning_y, PAGE_W - 68, 55, 9, fill=1, stroke=0)
    c.setFillColor(ink)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(48, warning_y + 37, "BEFORE YOU PAY")
    draw_wrapped(
        c,
        "A room is reserved only after the application is reviewed, exact payment instructions are confirmed, and Hamba Trading acknowledges the reservation in writing. Do not use banking details from an older message.",
        48,
        warning_y + 23,
        PAGE_W - 96,
        7.7,
        9.4,
        ink,
    )

    c.setFillColor(cream)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(34, 52, "081 267 4647")
    c.setFillColor(muted)
    c.setFont("Helvetica", 7.5)
    c.drawString(34, 38, "Calls & WhatsApp")
    c.setFillColor(accent)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawRightString(PAGE_W - 34, 52, "hambatrading.co.za")
    c.setFillColor(muted)
    c.setFont("Helvetica", 7)
    c.drawRightString(PAGE_W - 34, 38, "Photos and recorded prices do not guarantee current availability.")
    draw_wrapped(c, str(data["household_note"]), 34, 24, PAGE_W - 68, 6.6, 8, muted)

    c.linkURL("https://hambatrading.co.za", (PAGE_W - 190, 35, PAGE_W - 30, 62), relative=0)
    c.linkURL("https://wa.me/27812674647", (30, 34, 180, 63), relative=0)


def draw_pdf(data: dict[str, object]) -> Path:
    output = MARKETING / f"{data['slug']}.pdf"
    c = canvas.Canvas(str(output), pagesize=A4, pageCompression=1)
    c.setTitle(f"{data['brand']} property advert")
    c.setAuthor("Hamba Trading")

    accent = HexColor(str(data["accent"]))
    cream = HexColor("#f5e4c5")
    ink = HexColor("#11100e")
    muted = HexColor("#b9aea0")

    c.setFillColor(HexColor("#090807"))
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    for offset in range(-500, 1000, 24):
        c.setStrokeColor(Color(1, 1, 1, alpha=0.025))
        c.line(offset, 0, offset + 500, PAGE_H)

    # Header
    c.drawImage(str(MARKETING / str(data["profile"])), 34, PAGE_H - 88, 54, 54, mask="auto")
    c.setFillColor(accent)
    c.setFont("Helvetica-Bold", 20)
    c.drawString(102, PAGE_H - 57, str(data["brand"]))
    c.setFillColor(muted)
    c.setFont("Helvetica-Bold", 7.5)
    c.drawString(103, PAGE_H - 73, str(data["strapline"]))
    c.setFillColor(accent)
    c.setFont("Helvetica-Bold", 7.5)
    c.drawRightString(PAGE_W - 34, PAGE_H - 57, "HAMBA TRADING")
    c.setStrokeColor(Color(accent.red, accent.green, accent.blue, alpha=0.5))
    c.line(34, PAGE_H - 103, PAGE_W - 34, PAGE_H - 103)

    # Hero and primary offer
    hero_y = PAGE_H - 356
    draw_cover(c, MARKETING / str(data["hero"]), 309, hero_y, PAGE_W - 343, 235)
    c.setFillColor(HexColor("#13110e"))
    c.rect(34, hero_y, 263, 235, fill=1, stroke=0)
    c.setFillColor(accent)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(50, hero_y + 207, str(data["area"]))
    c.setFillColor(cream)
    c.setFont("Helvetica-Bold", 34)
    c.drawString(50, hero_y + 160, "ROOMS")
    c.drawString(50, hero_y + 124, "TO LET")
    draw_wrapped(c, str(data["address"]), 50, hero_y + 96, 224, 10, 14, HexColor("#dfd4c4"))
    c.setFillColor(accent)
    c.roundRect(50, hero_y + 26, 225, 45, 8, fill=1, stroke=0)
    c.setFillColor(ink)
    c.setFont("Helvetica-Bold", 13 if "R2,200" in str(data["price"]) else 8.5)
    c.drawCentredString(162.5, hero_y + 51, str(data["price"]))
    c.setFont("Helvetica", 7.5)
    c.drawCentredString(162.5, hero_y + 38, str(data["deposit"]))

    # Image strip
    strip_y = hero_y - 141
    draw_cover(c, MARKETING / str(data["room"]), 34, strip_y, 327, 126)
    draw_cover(c, MARKETING / str(data["detail"]), 373, strip_y, PAGE_W - 407, 126)
    c.setFillColor(Color(0, 0, 0, alpha=0.55))
    c.rect(34, strip_y, PAGE_W - 68, 24, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 7.5)
    c.drawString(45, strip_y + 8, "EXAMPLE ROOM DETAILS - FINISHES MAY VARY BY UNIT")

    # Information columns
    content_y = strip_y - 25
    c.setFillColor(accent)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(34, content_y, "CONFIRMED ESSENTIALS")
    c.drawString(314, content_y, "HOW TO APPLY")

    left_y = content_y - 21
    for item in data["highlights"]:
        c.setFillColor(accent)
        c.circle(40, left_y + 3, 3, fill=1, stroke=0)
        left_y = draw_wrapped(c, str(item), 50, left_y, 232, 8.5, 12, HexColor("#e8dfd3")) - 5

    right_y = content_y - 21
    for number, item in enumerate(
        [
            "Browse the property photos",
            "Ask staff to confirm availability and fit",
            "Submit ID/passport and three months bank statements",
        ],
        1,
    ):
        c.setFillColor(accent)
        c.circle(321, right_y + 3, 7, fill=1, stroke=0)
        c.setFillColor(ink)
        c.setFont("Helvetica-Bold", 7)
        c.drawCentredString(321, right_y + 1, str(number))
        right_y = draw_wrapped(c, item, 335, right_y, 222, 8.5, 12, HexColor("#e8dfd3")) - 7

    note_y = min(left_y, right_y) - 4
    c.setFillColor(Color(accent.red, accent.green, accent.blue, alpha=0.12))
    c.roundRect(34, note_y - 40, PAGE_W - 68, 38, 7, fill=1, stroke=0)
    draw_wrapped(c, str(data["fit"]), 47, note_y - 17, PAGE_W - 94, 8.2, 11, HexColor("#e6d7c1"))

    # Footer links
    footer_h = 71
    c.setFillColor(accent)
    c.rect(0, 0, PAGE_W, footer_h, fill=1, stroke=0)
    c.setFillColor(ink)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(34, 49, "CALLS & WHATSAPP")
    c.setFont("Helvetica-Bold", 19)
    c.drawString(34, 26, "081 267 4647")
    c.setFont("Helvetica-Bold", 8.5)
    c.drawRightString(PAGE_W - 34, 47, "hambatrading.co.za")
    c.drawRightString(PAGE_W - 34, 30, "VIEW THE FULL PHOTO PORTFOLIO")
    c.setFont("Helvetica", 6.6)
    c.drawRightString(PAGE_W - 34, 14, "Photos do not guarantee availability. Full terms are provided in the lease.")

    website_rect = (PAGE_W - 190, 38, PAGE_W - 30, 58)
    photos_rect = (PAGE_W - 210, 21, PAGE_W - 30, 38)
    whatsapp_rect = (30, 15, 200, 58)
    c.linkURL("https://hambatrading.co.za", website_rect, relative=0)
    c.linkURL(str(data["photos"]), photos_rect, relative=0)
    c.linkURL("https://wa.me/27812674647", whatsapp_rect, relative=0)

    c.showPage()
    draw_detail_page(c, data)
    c.showPage()
    c.save()
    return output


if __name__ == "__main__":
    for property_data in PROPERTIES:
        print(draw_pdf(property_data))
