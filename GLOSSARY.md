# Servisník

Odľahčený ERP pre autoservisy: zákazky, zákazníci, vozidlá, sklad a faktúry. Pojmy sú po slovensky, v zátvorke je názov v kóde.

## Language

**Zákazka** (`WorkOrder`):
Práca, ktorú si zákazník objednal na konkrétnom vozidle, od príjmu vozidla po uzavretie.
_Avoid_: objednávka (zákazníka), job

**Objednávka** (`PurchaseOrder`):
Objednávka dielov u dodávateľa, vzniká zo zákazky. Nikdy neoznačuje to, čo si objednal zákazník.
_Avoid_: nákupná objednávka
