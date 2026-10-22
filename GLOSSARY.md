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
