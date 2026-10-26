# Servisník

Odľahčený ERP pre autoservisy: zákazky, zákazníci, vozidlá, sklad a faktúry. Pojmy sú po slovensky, v zátvorke je názov v kóde.

## Language

**Zákazka** (`WorkOrder`):
Práca, ktorú si zákazník objednal na konkrétnom vozidle, od príjmu vozidla po uzavretie.
_Avoid_: objednávka (zákazníka), job

**Objednávka** (`PurchaseOrder`):
Objednávka dielov u dodávateľa, vzniká zo zákazky. Nikdy neoznačuje to, čo si objednal zákazník.
_Avoid_: nákupná objednávka

**Používateľ** (`User`):
Osoba z autoservisu, ktorá sa prihlasuje do Servisníka. Nikdy neoznačuje zákazníka autoservisu.
_Avoid_: účet, pracovník

**Rola** (`Role`):
Určuje, čo používateľ v Servisníku vidí: `admin` vidí všetko, `mechanik` len zákazky a bez cien.
_Avoid_: oprávnenie, typ používateľa

### Zákazníci a vozidlá

**Zákazník** (`Customer`):
Osoba alebo firma, ktorej autoservis opravuje vozidlá a vystavuje faktúry. Je to buď osoba, alebo firma.
_Avoid_: klient, odberateľ, partner

**Osoba** (`person`):
Zákazník bez IČO, teda súkromná osoba.
_Avoid_: fyzická osoba, súkromník

**Firma** (`company`):
Zákazník s IČO, teda právnická osoba aj živnostník.
_Avoid_: podnikateľ, organizácia, SZČO

**Vozidlo** (`Vehicle`):
Auto, ktoré autoservis eviduje a opravuje, určené svojím VIN.
_Avoid_: auto, motorové vozidlo

**VIN** (`vin`):
17-miestny identifikačný kód vozidla. Určuje vozidlo v Servisníku jednoznačne.
_Avoid_: číslo karosérie, výrobné číslo

**ŠPZ** (`licensePlate`):
Evidenčné číslo na značke vozidla. Neurčuje vozidlo, lebo sa môže zmeniť alebo prejsť na iné auto.
_Avoid_: EČV, evidenčné číslo, značka

**Majiteľ** (`owner`):
Zákazník, ku ktorému autoservis vozidlo práve eviduje. Je to ten, kto auto vozí a platí, nie vlastník z technického preukazu (pri lízingu je vlastníkom lízingová spoločnosť).
_Avoid_: vlastník, držiteľ, prevádzkovateľ

**Prepis** (`transferOwnership`):
Zmena majiteľa vozidla, napríklad pri predaji auta. Zákazky vozidla ostávajú pri ňom.
_Avoid_: predaj, prevod
