import re
import io
import uuid
from datetime import date as date_type
from typing import Optional
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import Expense

router = APIRouter(prefix="/api/import", tags=["import"])

# ── Categorization rules: first match wins ──────────────────────────────────
RULES = [
    # Sport
    ('AYA FITNESS',         'Abonnement', 'Sport / Salle'),
    ('ON AIR',              'Abonnement', 'Sport / Salle'),
    ('BASIC FIT',           'Abonnement', 'Sport / Salle'),
    ('BASIC-FIT',           'Abonnement', 'Sport / Salle'),
    ('GYMLIB',              'Abonnement', 'Sport / Salle'),
    ('L ORANGE BLEUE',      'Abonnement', 'Sport / Salle'),
    ('FITNESS',             'Abonnement', 'Sport / Salle'),
    # Téléphone
    ('FREE MOBILE',         'Abonnement', 'Téléphone'),
    ('FREEMOBILE',          'Abonnement', 'Téléphone'),
    ('ORANGE MOBILE',       'Abonnement', 'Téléphone'),
    ('BOUYGUES TELECOM',    'Abonnement', 'Téléphone'),
    ('SFR ',                'Abonnement', 'Téléphone'),
    ('SOSH',                'Abonnement', 'Téléphone'),
    ('NRJ MOBILE',          'Abonnement', 'Téléphone'),
    # Streaming
    ('NETFLIX',             'Abonnement', 'Streaming'),
    ('SPOTIFY',             'Abonnement', 'Streaming'),
    ('DISNEY',              'Abonnement', 'Streaming'),
    ('PRIME VIDEO',         'Abonnement', 'Streaming'),
    ('AMAZON PRIME',        'Abonnement', 'Streaming'),
    ('CANAL+',              'Abonnement', 'Streaming'),
    ('DEEZER',              'Abonnement', 'Streaming'),
    ('APPLE TV',            'Abonnement', 'Streaming'),
    # Autres abonnements
    ('OPENAI',              'Abonnement', 'Autres abonnements'),
    ('CHATGPT',             'Abonnement', 'Autres abonnements'),
    ('CLAUDE',              'Abonnement', 'Autres abonnements'),
    ('ANTHROPIC',           'Abonnement', 'Autres abonnements'),
    ('ADOBE',               'Abonnement', 'Autres abonnements'),
    ('MICROSOFT',           'Abonnement', 'Autres abonnements'),
    ('DROPBOX',             'Abonnement', 'Autres abonnements'),
    ('SOBRIO',              'Abonnement', 'Autres abonnements'),
    ('COTISATION',          'Abonnement', 'Autres abonnements'),
    ('ABONNEMENT',          'Abonnement', 'Autres abonnements'),
    # Courses
    ('LECLERC',             'Vie quotidienne', 'Courses'),
    ('CARREFOUR',           'Vie quotidienne', 'Courses'),
    ('MONOPRIX',            'Vie quotidienne', 'Courses'),
    ('FRANPRIX',            'Vie quotidienne', 'Courses'),
    ('ALDI',                'Vie quotidienne', 'Courses'),
    ('LIDL',                'Vie quotidienne', 'Courses'),
    ('INTERMARCHE',         'Vie quotidienne', 'Courses'),
    ('CASINO',              'Vie quotidienne', 'Courses'),
    ('PICARD',              'Vie quotidienne', 'Courses'),
    ('GRAND FRAIS',         'Vie quotidienne', 'Courses'),
    ('G20',                 'Vie quotidienne', 'Courses'),
    # Livraison
    ('POPCHEF',             'Vie quotidienne', 'Livraison repas'),
    ('UBER EATS',           'Vie quotidienne', 'Livraison repas'),
    ('UBEREATS',            'Vie quotidienne', 'Livraison repas'),
    ('DELIVEROO',           'Vie quotidienne', 'Livraison repas'),
    ('JUST EAT',            'Vie quotidienne', 'Livraison repas'),
    # Restaurants
    ('QUICK',               'Vie quotidienne', 'Restaurants'),
    ('MCDONALD',            'Vie quotidienne', 'Restaurants'),
    ('MC DONALD',           'Vie quotidienne', 'Restaurants'),
    ('KFC',                 'Vie quotidienne', 'Restaurants'),
    ('BURGER KING',         'Vie quotidienne', 'Restaurants'),
    ('RESTAURANT',          'Vie quotidienne', 'Restaurants'),
    ('SUSHI',               'Vie quotidienne', 'Restaurants'),
    ('OCEAN',               'Vie quotidienne', 'Restaurants'),
    # Café / snacks
    ('STARBUCKS',           'Vie quotidienne', 'Café / Snacks'),
    ('AD2',                 'Vie quotidienne', 'Café / Snacks'),
    ('PAUL ',               'Vie quotidienne', 'Café / Snacks'),
    # Transport
    ('SERVICE NAVIGO',      'Transport', 'Transport en commun'),
    ('NAVIGO',              'Transport', 'Transport en commun'),
    ('SNCF',                'Transport', 'Transport en commun'),
    ('RATP',                'Transport', 'Transport en commun'),
    ('TRANSILIEN',          'Transport', 'Transport en commun'),
    ('UBER',                'Transport', 'Taxi / VTC'),
    ('BOLT',                'Transport', 'Taxi / VTC'),
    ('HEETCH',              'Transport', 'Taxi / VTC'),
    ('TOTAL ENERGIE',       'Transport', 'Carburant'),
    ('ESSO',                'Transport', 'Carburant'),
    ('SHELL',               'Transport', 'Carburant'),
    # Loisirs
    ('FNAC',                'Loisirs', 'Livres / Culture'),
    ('CULTURA',             'Loisirs', 'Livres / Culture'),
    ('AMAZON',              'Loisirs', 'Shopping'),
    ('ZALANDO',             'Loisirs', 'Shopping'),
    ('ZARA',                'Loisirs', 'Shopping'),
    ('UGC',                 'Loisirs', 'Cinéma / Sorties'),
    ('PATHE',               'Loisirs', 'Cinéma / Sorties'),
    ('MK2',                 'Loisirs', 'Cinéma / Sorties'),
    # Santé
    ('PHARMACIE',           'Santé', 'Pharmacie'),
    ('PHARMA',              'Santé', 'Pharmacie'),
    ('MUTUELLE',            'Santé', 'Mutuelle'),
    ('MGEN',                'Santé', 'Mutuelle'),
    ('ALAN',                'Santé', 'Mutuelle'),
    # Logement
    ('LOYER',               'Logement', 'Loyer'),
    ('EDF',                 'Logement', 'Charges'),
    ('ENGIE',               'Logement', 'Charges'),
    ('ASSURANCE HABITAT',   'Logement', 'Assurance habitation'),
    # Retrait
    ('RETRAIT DAB',         'Vie quotidienne', 'Retrait'),
    ('RETRAITDAB',          'Vie quotidienne', 'Retrait'),
    # Autre
    ('FRAIS PAIEMENT',      'Autre', 'Autre'),
    ('FRAIS',               'Autre', 'Autre'),
]

CREDIT_KEYWORDS   = ['VIR RECU', 'VIR INST RE', 'SALAIRE']
TRANSFER_KEYWORDS = ['VIR INSTANTANE EMIS', 'VIR EMIS', 'VIR SEPA EMIS']

# Legal-form suffixes that appear after a merchant name in prélèvement descriptions
_LEGAL_FORMS = re.compile(
    r'\s*[-–/]\s*(?:FI|SAS?|SARL|SA|SCI|SC|EIRL|EURL|SNC|GIE|SE|SCM|SCP|SPF|EI)\b.*$',
    re.I
)

_BANK_NAMES = [
    (r'LCL\b',              'LCL'),
    (r'BNP\b',              'BNP Paribas'),
    (r'LA BANQUE POSTALE',  'La Banque Postale'),
    (r'CASH SERVICES',      None),
    (r'SG\b',               'Société Générale'),
    (r'PARIS\s+EPINETTES',  'Société Générale'),
    (r'CREDIT AGRICOLE',    'Crédit Agricole'),
    (r'CREDIT MUTUEL',      'Crédit Mutuel'),
    (r'CAISSE D.EPARGNE',   "Caisse d'Épargne"),
    (r'SOCIETE GENERALE',   'Société Générale'),
]


def _categorize(description: str) -> tuple[str, str]:
    up = description.upper()
    for kw, cat, sub in RULES:
        if kw.upper() in up:
            return cat, sub
    return 'Autre', 'Autre'


def _parse_amount(s: str) -> Optional[float]:
    if not s or not s.strip():
        return None
    s = s.strip().replace('\xa0', '').replace(' ', '').replace(' ', '')
    s = re.sub(r'\.(?=\d{3}[,\.])', '', s)
    s = s.replace(',', '.')
    m = re.search(r'\d+\.?\d*', s)
    if m:
        try:
            return float(m.group())
        except ValueError:
            pass
    return None


def _parse_date(s: str) -> Optional[str]:
    m = re.match(r'(\d{2})/(\d{2})/(\d{4})', s.strip())
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    return None


def _normalize_pdf_text(text: str) -> str:
    """Restore spaces that PDF text extraction omits between adjacent words."""
    # Insert space before these keywords when immediately preceded by a letter or digit
    for kw in ['PRELEVEMENT', 'EUROPEEN', 'RETRAIT', 'DAB', 'COTISATION',
                'MENSUELLE', 'ELECTRONIQUE', 'INSTANTANE', 'EMIS', 'PAIEMENT', 'FRAIS']:
        text = re.sub(r'(?<=[A-Za-z0-9])(' + kw + r')', r' \1', text, flags=re.I)
    # Also insert space AFTER these keywords when directly followed by a letter or digit
    for kw in ['MENSUELLE', 'ELECTRONIQUE', 'DAB']:
        text = re.sub(r'(' + kw + r')(?=[A-Za-z0-9])', r'\1 ', text, flags=re.I)
    # CARTE immediately followed by alphanumeric card ref → add space
    text = re.sub(r'(CARTE)(?=[A-Z0-9])', r'\1 ', text, flags=re.I)
    # "DE:MERCHANT" → "DE: MERCHANT" (colon directly followed by a letter)
    text = re.sub(r'(:)(?=[A-Za-z])', r'\1 ', text)
    return text


def _clean_description(raw: str) -> str:
    """Turn raw bank statement text into a short, human-readable label."""
    s = raw.strip()
    UP = s.upper()

    # ── Prélèvement ──────────────────────────────────────────────────────────
    if 'PRELEVEMENT' in UP or ('PRLV' in UP and ('DE:' in UP or 'ID:' in UP)):
        # Strip leading type words
        cleaned = re.sub(r'^\s*PRELEVEMENT\s+(?:EUROPEEN\s+|SEPA\s+|FRAIS\s+)?', '', s, flags=re.I).strip()
        cleaned = re.sub(r'^\s*PRLV\s+(?:SEPA\s+)?', '', cleaned, flags=re.I).strip()
        # Strip leading reference number like "8304154379 DE: ..."
        cleaned = re.sub(r'^\d+\s+', '', cleaned).strip()

        # Try "DE: merchant ... ID:|REF:|MANDAT:|MOTIF:"
        m = re.search(r'DE:\s*(.+?)(?=\s+(?:ID:|REF:|MANDAT:|MOTIF:)|$)', cleaned, re.I)
        if m:
            name = m.group(1).strip()
        else:
            # Take everything before technical fields
            name = re.split(r'\s+(?:ID:|REF:|MANDAT:|MOTIF:)', cleaned, maxsplit=1)[0].strip()
            name = re.split(r'\s+[A-Z]{2}\d{8,}', name, maxsplit=1)[0].strip()

        # Strip CamelCase venue suffix like "-OnAirBobigny"
        name = re.sub(r'-(?:[A-Z][a-zA-Z]+)+$', '', name).strip()
        name = _LEGAL_FORMS.sub('', name).strip()
        name = re.sub(r'\s*[-–]\s*\w{2,4}[-\d].*$', '', name).strip()
        return name.title() if name else "Prélèvement"

    # ── Retrait DAB ──────────────────────────────────────────────────────────
    if 'RETRAIT' in UP and 'DAB' in UP:
        m = re.search(r'RETRAIT\s+DAB\s*(?:SG\s+)?(?:\d{2}/\d{2}\s*\d*H\d+\s*)?(.+)', s, re.I)
        if m:
            loc = m.group(1).strip()
            loc = re.sub(r'\d+$', '', loc).strip()   # strip trailing numeric code e.g. "154035"
            for pattern, bank_name in _BANK_NAMES:
                if re.search(pattern, loc, re.I):
                    return f"Retrait DAB{' — ' + bank_name if bank_name else ''}"
            first = loc.split()[0].title() if loc else ''
            return f"Retrait DAB — {first}" if first else "Retrait DAB"
        return "Retrait DAB"

    # ── Virement émis ────────────────────────────────────────────────────────
    if re.search(r'VIR\s+(?:INSTANTANE\s+)?EMIS', UP):
        recipient = re.search(r'POUR:\s*(.+?)(?=\s+\d{2}\s+\d{2}\b|\s+DATE:|\s+REF:|$)', s, re.I)
        motif     = re.search(r'MOTIF:\s*(.+?)(?=\s+(?:CHEZ|REF):|$)', s, re.I)
        if recipient:
            r      = recipient.group(1).strip().title()
            suffix = f" ({motif.group(1).strip()})" if motif else ""
            return f"Virement → {r}{suffix}"
        return "Virement émis"

    # ── Virement reçu ────────────────────────────────────────────────────────
    if re.search(r'VIR\s+(?:RECU|INST\s+RE)\b', UP):
        sender = re.search(r'DE:\s*(.+?)(?=\s+(?:MOTIF|DATE|REF):|$)', s, re.I)
        motif  = re.search(r'MOTIF:\s*(.+?)(?=\s+REF:|$)', s, re.I)
        if sender:
            snd    = sender.group(1).strip().title()
            suffix = f" ({motif.group(1).strip()})" if motif else ""
            return f"Virement reçu — {snd}{suffix}"
        return "Virement reçu"

    # ── Frais hors zone euro ─────────────────────────────────────────────────
    if 'FRAIS PAIEMENT HORS ZONE' in UP:
        return "Frais paiement hors zone euro"

    # ── Cotisation mensuelle ─────────────────────────────────────────────────
    if 'COTISATION MENSUELLE' in UP:
        name = re.sub(r'COTISATION MENSUELLE\s*', '', s, flags=re.I).strip()
        return f"{name.title()} — cotisation mensuelle" if name else "Cotisation mensuelle"

    # ── CARTE XXXX DD/MM merchant ────────────────────────────────────────────
    m = re.search(r'CARTE\s+[\w\d]+\s*(.*)', s, re.I)
    if m:
        merchant = m.group(1).strip()
        # Strip leading date fragment — handles "20/04 MERCHANT", "/04MERCHANT", "20/04MERCHANT"
        merchant = re.sub(r'^/?(?:\d{1,2}/)?\d{2}\s*', '', merchant)
        merchant = re.sub(r'\s+COMMERCE\s+ELECTRONIQUE.*', '', merchant, flags=re.I)
        merchant = re.sub(r'\s+\d{1,3}[,\.]\d{2}\s+EUR.*', '', merchant, flags=re.I)
        merchant = re.sub(r'\s+ETATS.UNIS.*', '', merchant, flags=re.I)
        merchant = re.sub(r'\s+(?:SARL|SAS?|SA\b|SCI\b|EIRL|EURL).*$', '', merchant, flags=re.I)
        merchant = re.sub(r'OPENAI\s*\*?\s*CHATGPT.*', 'ChatGPT (OpenAI)', merchant, flags=re.I)
        merchant = re.sub(r'SumUp\s*\*\S*', 'SumUp', merchant, flags=re.I)
        merchant = re.sub(r'SC-ANAS\.AUT', 'SC-Anas', merchant, flags=re.I)
        return merchant.strip()

    return s[:80]


def _is_credit(desc: str) -> bool:
    up = desc.upper()
    return any(k in up for k in CREDIT_KEYWORDS)


def _is_transfer_out(desc: str) -> bool:
    up = desc.upper()
    return any(k in up for k in TRANSFER_KEYWORDS)


def _is_recurring(desc: str) -> bool:
    up = desc.upper()
    return 'PRELEVEMENT' in up or 'PRLV' in up


def _parse_sg_pdf(content: bytes) -> list[dict]:
    try:
        import pdfplumber
    except ImportError:
        raise RuntimeError("pdfplumber non installé")

    raw_rows = []

    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages:
            pw = page.width

            debit_x  = pw * 0.66
            credit_x = pw * 0.83

            words = page.extract_words(x_tolerance=3, y_tolerance=3)
            if not words:
                continue

            y_map: dict[int, list] = {}
            for w in words:
                key = int(w['top'] / 4) * 4
                y_map.setdefault(key, []).append(w)

            for y in sorted(y_map):
                row = sorted(y_map[y], key=lambda w: w['x0'])

                left_words   = [w for w in row if w['x1'] <= debit_x]
                debit_words  = [w for w in row if w['x0'] >= debit_x and w['x1'] <= credit_x]
                credit_words = [w for w in row if w['x0'] >= credit_x]

                raw_rows.append({
                    'text':   ' '.join(w['text'] for w in left_words).strip(),
                    'debit':  ' '.join(w['text'] for w in debit_words).strip(),
                    'credit': ' '.join(w['text'] for w in credit_words).strip(),
                })

    return _group_transactions(raw_rows)


_DATE_ROW = re.compile(r'^(\d{2}/\d{2}/\d{4})\s+(\d{2}/\d{2}/\d{4})\s*(.*)')
_SKIP     = re.compile(
    r'(SOLDE|TOTAUX|Date Valeur|suite|Débit|Crédit|Nature de l|N° ADEME|Société Générale'
    r'|S\.A\. au capital|Siège Social|RELEVÉ DE COMPTE|COMPTE DE PARTI|du \d|envoi|Page \d'
    r'|RA\d|Pour toute|En dernier|votre|Votre|par |MR |par t|Du lundi|par messagerie)',
    re.I,
)


def _group_transactions(raw_rows: list[dict]) -> list[dict]:
    transactions = []
    current = None

    for row in raw_rows:
        text = row['text']
        if not text:
            continue

        if _SKIP.search(text):
            if current:
                transactions.append(current)
                current = None
            continue

        m = _DATE_ROW.match(text)
        if m:
            if current:
                transactions.append(current)

            date_iso    = _parse_date(m.group(1))
            description = m.group(3).strip()
            debit       = _parse_amount(row['debit'])
            credit      = _parse_amount(row['credit'])

            if debit is None and credit is None:
                amt_m = re.search(r'(\d[\d\s]*[,\.]\d{2})\s*$', description)
                if amt_m:
                    maybe = _parse_amount(amt_m.group(1))
                    if maybe and maybe > 0:
                        description = description[:amt_m.start()].strip()
                        debit = maybe

            current = {
                'date':        date_iso,
                'description': description,
                'debit':       debit,
                'credit':      credit,
            }

        elif current:
            if row['debit'] and current['debit'] is None:
                current['debit'] = _parse_amount(row['debit'])
            if row['credit'] and current['credit'] is None:
                current['credit'] = _parse_amount(row['credit'])
            if text and not re.match(r'^[\d\s,\.\+\*]+$', text):
                current['description'] = (current['description'] + ' ' + text).strip()

    if current:
        transactions.append(current)

    return transactions


# ── API models ───────────────────────────────────────────────────────────────

class TxIn(BaseModel):
    date:         str
    description:  str
    amount:       float
    category:     str
    subcategory:  str
    is_recurring: bool
    is_credit:    bool
    is_transfer:  bool


class ConfirmBody(BaseModel):
    transactions: list[TxIn]


# ── Endpoints ────────────────────────────────────────────────────────────────

def _is_duplicate(tx_date_iso: str, amount: float,
                   real_exps: list, recurring_exps: list) -> bool:
    from datetime import timedelta
    try:
        tx_date = date_type.fromisoformat(tx_date_iso)
    except Exception:
        return False

    for exp in real_exps:
        if abs(exp.amount - amount) < 0.02 and abs((exp.date - tx_date).days) <= 3:
            return True

    for exp in recurring_exps:
        if abs(exp.amount - amount) < 0.02:
            day = exp.recurring_day or exp.date.day
            if abs(day - tx_date.day) <= 4:
                return True

    return False


@router.post("/preview")
async def preview_import(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not (file.filename or '').lower().endswith('.pdf'):
        raise HTTPException(400, "Seuls les fichiers PDF sont acceptés")

    content = await file.read()
    if len(content) > 15 * 1024 * 1024:
        raise HTTPException(400, "Fichier trop volumineux (max 15 Mo)")

    try:
        raw = _parse_sg_pdf(content)
    except Exception as e:
        raise HTTPException(422, f"Impossible de lire le PDF : {e}")

    from datetime import timedelta

    valid_dates = [r['date'] for r in raw if r.get('date')]
    if valid_dates:
        min_d = min(date_type.fromisoformat(d) for d in valid_dates)
        max_d = max(date_type.fromisoformat(d) for d in valid_dates)
        real_exps = db.query(Expense).filter(
            Expense.date >= min_d - timedelta(days=5),
            Expense.date <= max_d + timedelta(days=5),
            Expense.is_recurring == False,
        ).all()
    else:
        real_exps = []

    recurring_exps = db.query(Expense).filter(Expense.is_recurring == True).all()

    results = []
    for tx in raw:
        if not tx.get('date'):
            continue

        desc    = _normalize_pdf_text(tx['description'])
        is_cred = _is_credit(desc)
        is_trf  = _is_transfer_out(desc)
        amount  = tx.get('debit') or tx.get('credit') or 0

        if amount <= 0:
            continue

        cat, sub  = _categorize(desc)
        recurring = _is_recurring(desc)
        is_dup    = _is_duplicate(tx['date'], amount, real_exps, recurring_exps)

        results.append({
            'date':         tx['date'],
            'description':  _clean_description(desc),
            'amount':       round(amount, 2),
            'category':     cat,
            'subcategory':  sub,
            'is_recurring': recurring,
            'is_credit':    is_cred,
            'is_transfer':  is_trf,
            'is_duplicate': is_dup,
            'selected':     not is_cred and not is_trf and not is_dup,
        })

    # Intra-batch deduplication: recurring transactions with the same amount
    # appearing more than once in the same statement (e.g. monthly sub crossing months)
    seen_recurring: dict[float, int] = {}  # amount → result index
    for idx, tx in enumerate(results):
        if tx['is_recurring'] and not tx['is_credit']:
            key = tx['amount']
            if key in seen_recurring:
                # Mark the earlier occurrence as duplicate, keep the latest
                earlier = seen_recurring[key]
                results[earlier]['is_duplicate'] = True
                results[earlier]['selected']     = False
            seen_recurring[key] = idx

    return {'transactions': results, 'total': len(results)}


@router.post("/confirm")
async def confirm_import(body: ConfirmBody, db: Session = Depends(get_db)):
    if not body.transactions:
        raise HTTPException(400, "Aucune transaction à importer")

    batch_id = str(uuid.uuid4())
    imported = 0
    for tx in body.transactions:
        try:
            d = date_type.fromisoformat(tx.date)
            exp = Expense(
                category        = tx.category,
                subcategory     = tx.subcategory or None,
                amount          = tx.amount,
                date            = d,
                description     = tx.description,
                is_recurring    = tx.is_recurring,
                recurring_day   = d.day if tx.is_recurring else None,
                import_batch_id = batch_id,
            )
            db.add(exp)
            imported += 1
        except Exception:
            continue

    db.commit()
    return {'imported': imported, 'batch_id': batch_id}


@router.delete("/batch/{batch_id}")
async def delete_import_batch(batch_id: str, db: Session = Depends(get_db)):
    deleted = db.query(Expense).filter(Expense.import_batch_id == batch_id).delete()
    db.commit()
    return {'deleted': deleted}


_MONTHS_FR = ['', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
              'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']


@router.post("/payslip")
async def import_payslip(file: UploadFile = File(...)):
    """Parse a French bulletin de paie PDF and return the net pay + period."""
    if not (file.filename or '').lower().endswith('.pdf'):
        raise HTTPException(400, "Seuls les fichiers PDF sont acceptés")

    content = await file.read()
    if len(content) > 15 * 1024 * 1024:
        raise HTTPException(400, "Fichier trop volumineux (max 15 Mo)")

    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            text = '\n'.join(page.extract_text() or '' for page in pdf.pages)
    except Exception as e:
        raise HTTPException(422, f"Impossible de lire le PDF : {e}")

    # ── Net pay ──────────────────────────────────────────────────────────────
    # Matches "NET A PAYER AU SALARIE (en euros)  2979,49"
    net_pay = None
    for pattern in [
        r'NET\s+A\s+PAYER\s+AU\s+SALARIE[^0-9\n]*?([\d\s \xa0]+[,\.]\d{2})',
        r'NET\s+A\s+PAYER\s+AU\s+SALARIE.*?\n.*?([\d\s \xa0]+[,\.]\d{2})',
    ]:
        m = re.search(pattern, text, re.I | re.S)
        if m:
            raw = m.group(1).strip()
            raw = re.sub(r'[\s \xa0]', '', raw).replace(',', '.')
            try:
                net_pay = float(raw)
                if net_pay > 0:
                    break
            except ValueError:
                pass

    if not net_pay:
        raise HTTPException(422, "Salaire net introuvable dans ce document. Vérifiez qu'il s'agit d'un bulletin de paie.")

    # ── Period ────────────────────────────────────────────────────────────────
    month, year = None, None
    m = re.search(r'Du\s+\d{1,2}[-./]\s*(\d{2})[-./]\s*(\d{4})', text, re.I)
    if m:
        month = int(m.group(1))
        year  = int(m.group(2))

    period_label = f"{_MONTHS_FR[month]} {year}" if month and 1 <= month <= 12 else None

    # ── Employer ─────────────────────────────────────────────────────────────
    employer = None
    m = re.search(r'^([A-Z][A-Z\s\-\.&]+)\n', text, re.M)
    if m:
        employer = m.group(1).strip()

    return {
        'net_pay':      round(net_pay, 2),
        'month':        month,
        'year':         year,
        'period_label': period_label,
        'employer':     employer,
    }
