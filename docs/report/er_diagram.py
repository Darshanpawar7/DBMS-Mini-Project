"""Generates docs/report/er-diagram.svg -- the Phase 2 ER diagram in Chen notation.

Rectangles = entities (attributes listed, primary key underlined; dashed underline = partial key).
Double rectangle = weak entity. Diamonds = relationships (double diamond = identifying).
Dashed ovals = relationship attributes. Double line = total participation.
Run:  python docs/report/er_diagram.py
"""
import math
from pathlib import Path

W, H = 1300, 960
INK, MUTED, BRAND = "#0f172a", "#64748b", "#4f46e5"
ENTITY_FILL, REL_FILL = "#eef2ff", "#fff7ed"
LINE_H, HEAD_H, BOX_W = 14, 28, 196

ENTITIES = {
    "STUDENT": ((650, 140), [("student_id", "pk"), "full_name", "email", "password_hash", "program", "year_of_study", "role", "is_active", "created_at", "last_login_at"]),
    "SEARCH_LOG": ((150, 120), [("log_id", "pk"), "query_text", "search_mode", "result_count", "query_embedding", "searched_at"]),
    "AUDIT_LOG": ((1150, 120), [("audit_id", "pk"), "table_name", "action", "row_pk", "old_data", "new_data", "logged_at"]),
    "COURSE": ((650, 520), [("course_id", "pk"), "course_code", "course_title", "department"]),
    "DOCUMENT": ((260, 600), [("doc_id", "pk"), "title", "description", "file_path", "file_type", "file_size_bytes", "visibility", "content", "search_tsv", "embedding_status", "upload_date", "updated_at"]),
    "STUDY_GROUP": ((1040, 600), [("group_id", "pk"), "group_name", "description", "max_members", "created_at"]),
    "TAG": ((110, 880), [("tag_id", "pk"), "tag_name"]),
    "DOC_CHUNK": ((430, 880), [("chunk_index", "partial"), "chunk_text", "embedding", "embedded_at"]),
}
WEAK = {"DOC_CHUNK"}

# name: (center, entity_a, card_a, total_a, entity_b, card_b, total_b, identifying)
RELATIONSHIPS = {
    "SEARCHES": ((400, 130), "STUDENT", "1", False, "SEARCH_LOG", "N", True, False),
    "PERFORMS": ((900, 130), "STUDENT", "1", False, "AUDIT_LOG", "N", False, False),
    "ENROLLS_IN": ((650, 330), "STUDENT", "M", False, "COURSE", "N", False, False),
    "UPLOADS": ((450, 380), "STUDENT", "1", False, "DOCUMENT", "N", True, False),
    "BOOKMARKS": ((300, 320), "STUDENT", "M", False, "DOCUMENT", "N", False, False),
    "CREATES": ((870, 400), "STUDENT", "1", False, "STUDY_GROUP", "N", False, False),
    "MEMBER_OF": ((1010, 320), "STUDENT", "M", False, "STUDY_GROUP", "N", True, False),
    "BELONGS_TO": ((460, 560), "DOCUMENT", "N", False, "COURSE", "1", False, False),
    "RUN_FOR": ((845, 560), "STUDY_GROUP", "N", True, "COURSE", "1", False, False),
    "TAGGED_WITH": ((140, 775), "DOCUMENT", "M", False, "TAG", "N", False, False),
    "HAS_CHUNK": ((395, 770), "DOCUMENT", "1", False, "DOC_CHUNK", "N", True, True),
}
# relationship attributes: (relationship, label, center)
REL_ATTRS = [
    ("ENROLLS_IN", "semester", (548, 418)),
    ("BOOKMARKS", "bookmarked_at", (150, 300)),
    ("MEMBER_OF", "role", (1160, 270)),
    ("MEMBER_OF", "joined_at", (1170, 345)),
]

DIAMOND_W, DIAMOND_H = 118, 58


def box_size(attrs):
    return BOX_W, HEAD_H + LINE_H * len(attrs) + 8


def ray_to_rect(center, half_w, half_h, toward):
    """Point where the ray from center toward `toward` leaves the rectangle."""
    dx, dy = toward[0] - center[0], toward[1] - center[1]
    t = min(half_w / abs(dx) if dx else math.inf, half_h / abs(dy) if dy else math.inf)
    return center[0] + dx * t, center[1] + dy * t


def ray_to_diamond(center, toward):
    dx, dy = toward[0] - center[0], toward[1] - center[1]
    t = 1 / (abs(dx) / (DIAMOND_W / 2) + abs(dy) / (DIAMOND_H / 2))
    return center[0] + dx * t, center[1] + dy * t


def esc(text):
    return text.replace("&", "&amp;").replace("<", "&lt;")


def line(a, b, double=False, dashed=False):
    if not double:
        dash = ' stroke-dasharray="4 3"' if dashed else ""
        return f'<line x1="{a[0]:.1f}" y1="{a[1]:.1f}" x2="{b[0]:.1f}" y2="{b[1]:.1f}" stroke="{INK}" stroke-width="1.3"{dash}/>'
    length = math.hypot(b[0] - a[0], b[1] - a[1]) or 1
    nx, ny = -(b[1] - a[1]) / length * 2.4, (b[0] - a[0]) / length * 2.4
    return "".join(
        f'<line x1="{a[0] + s * nx:.1f}" y1="{a[1] + s * ny:.1f}" x2="{b[0] + s * nx:.1f}" y2="{b[1] + s * ny:.1f}" stroke="{INK}" stroke-width="1.2"/>'
        for s in (1, -1)
    )


def card_label(entity_point, rel_point, text):
    length = math.hypot(rel_point[0] - entity_point[0], rel_point[1] - entity_point[1]) or 1
    ux, uy = (rel_point[0] - entity_point[0]) / length, (rel_point[1] - entity_point[1]) / length
    x, y = entity_point[0] + ux * 16 - uy * 10, entity_point[1] + uy * 16 + ux * 10
    return f'<text x="{x:.1f}" y="{y + 4:.1f}" text-anchor="middle" font-size="13" font-weight="700" fill="{BRAND}">{text}</text>'


def main():
    out = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="Inter, Segoe UI, Arial, sans-serif">',
        f'<rect width="{W}" height="{H}" fill="white"/>',
    ]
    edges, labels = [], []
    for name, (center, ea, ca, ta, eb, cb, tb, _ident) in RELATIONSHIPS.items():
        for ent, card, total in ((ea, ca, ta), (eb, cb, tb)):
            ecenter, attrs = ENTITIES[ent]
            w, h = box_size(attrs)
            p_entity = ray_to_rect(ecenter, w / 2, h / 2, center)
            p_rel = ray_to_diamond(center, ecenter)
            edges.append(line(p_entity, p_rel, double=total))
            labels.append(card_label(p_entity, p_rel, card))
    for rel, label, (x, y) in REL_ATTRS:
        rc = RELATIONSHIPS[rel][0]
        rx = max(38, len(label) * 3.9 + 12)
        p_rel = ray_to_diamond(rc, (x, y))
        dx, dy = rc[0] - x, rc[1] - y
        t = 1 / math.sqrt((dx / rx) ** 2 + (dy / 15) ** 2)
        edges.append(line((x + dx * t, y + dy * t), p_rel, dashed=True))
        out_attr = (
            f'<ellipse cx="{x}" cy="{y}" rx="{rx:.0f}" ry="15" fill="white" stroke="{MUTED}" stroke-dasharray="4 3"/>'
            f'<text x="{x}" y="{y + 4}" text-anchor="middle" font-size="11.5" fill="{INK}">{label}</text>'
        )
        labels.append(out_attr)
    out += edges

    for name, (center, *_rest) in RELATIONSHIPS.items():
        identifying = RELATIONSHIPS[name][7]
        x, y = center
        pts = f"{x},{y - DIAMOND_H / 2} {x + DIAMOND_W / 2},{y} {x},{y + DIAMOND_H / 2} {x - DIAMOND_W / 2},{y}"
        out.append(f'<polygon points="{pts}" fill="{REL_FILL}" stroke="#c2410c" stroke-width="1.3"/>')
        if identifying:
            inner = f"{x},{y - DIAMOND_H / 2 + 6} {x + DIAMOND_W / 2 - 10},{y} {x},{y + DIAMOND_H / 2 - 6} {x - DIAMOND_W / 2 + 10},{y}"
            out.append(f'<polygon points="{inner}" fill="none" stroke="#c2410c" stroke-width="1.1"/>')
        out.append(f'<text x="{x}" y="{y + 4}" text-anchor="middle" font-size="11" font-weight="700" fill="#9a3412">{name}</text>')

    for name, ((cx, cy), attrs) in ENTITIES.items():
        w, h = box_size(attrs)
        x0, y0 = cx - w / 2, cy - h / 2
        out.append(f'<rect x="{x0}" y="{y0}" width="{w}" height="{h}" rx="7" fill="{ENTITY_FILL}" stroke="{BRAND}" stroke-width="1.4"/>')
        if name in WEAK:
            out.append(f'<rect x="{x0 + 4}" y="{y0 + 4}" width="{w - 8}" height="{h - 8}" rx="5" fill="none" stroke="{BRAND}" stroke-width="1.1"/>')
        out.append(f'<text x="{cx}" y="{y0 + 19}" text-anchor="middle" font-size="13" font-weight="800" fill="{INK}">{name}</text>')
        out.append(f'<line x1="{x0 + 8}" y1="{y0 + HEAD_H - 2}" x2="{x0 + w - 8}" y2="{y0 + HEAD_H - 2}" stroke="{BRAND}" stroke-opacity="0.35"/>')
        for i, attr in enumerate(attrs):
            label, kind = (attr if isinstance(attr, tuple) else (attr, ""))
            ty = y0 + HEAD_H + 11 + i * LINE_H
            deco = ""
            if kind == "pk":
                deco = ' text-decoration="underline" font-weight="700"'
            out.append(f'<text x="{cx}" y="{ty}" text-anchor="middle" font-size="11.5" fill="{INK}"{deco}>{esc(label)}</text>')
            if kind == "partial":
                half = len(label) * 3.2
                out.append(f'<line x1="{cx - half}" y1="{ty + 2.5}" x2="{cx + half}" y2="{ty + 2.5}" stroke="{INK}" stroke-dasharray="3 2"/>')

    out += labels

    # legend
    lx, ly = 760, 740
    out.append(f'<rect x="{lx}" y="{ly}" width="500" height="185" rx="10" fill="#f8fafc" stroke="#e2e8f0"/>')
    out.append(f'<text x="{lx + 16}" y="{ly + 24}" font-size="12.5" font-weight="700" fill="{INK}">Notation (Chen)</text>')
    legend = [
        "Rectangle: entity (PK underlined) · double rectangle: weak entity",
        "Dashed underline: partial key (chunk_index, unique per document)",
        "Diamond: relationship · double diamond: identifying relationship",
        "Dashed oval: attribute of a relationship (M:N junction column)",
        "Double line: total participation (every row must take part)",
        "1 / N / M: cardinality · FKs appear only after mapping (see §3)",
    ]
    for i, text in enumerate(legend):
        out.append(f'<text x="{lx + 16}" y="{ly + 50 + i * 21}" font-size="11.5" fill="{MUTED}">{esc(text)}</text>')

    out.append("</svg>")
    target = Path(__file__).with_name("er-diagram.svg")
    target.write_text("\n".join(out), encoding="utf-8")
    print(f"wrote {target}")


if __name__ == "__main__":
    main()
