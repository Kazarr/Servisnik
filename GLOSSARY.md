# Servisník

Odľahčený ERP pre autoservisy: zákazky, zákazníci, vozidlá, sklad a faktúry. Pojmy sú po slovensky, v zátvorke je názov v kóde.

## Language

**Zákazka** (`WorkOrder`):
Oprava alebo údržba, ktorú si zákazník objednal na konkrétnom vozidle, od príjmu vozidla po uzavretie.
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

### Zákazka a faktúra

**Autoservis** (`Workshop`):
Firma, ktorá Servisník používa: opravuje vozidlá a vystavuje faktúry. Jeden Servisník slúži jednému autoservisu.
_Avoid_: firma (to je typ zákazníka), servis

**Položka zákazky** (`WorkOrderItem`):
Jedna práca alebo jeden diel na zákazke, s množstvom, cenou a sadzbou DPH.
_Avoid_: riadok, služba

**Práca** (`Labour`):
Položka zákazky za prácu mechanika, napríklad výmena oleja.
_Avoid_: úkon, výkon, služba

**Diel** (`Part`):
Položka zákazky za súčiastku alebo materiál, ktorý autoservis pri oprave použil.
_Avoid_: materiál, tovar, súčiastka

**Faktúra** (`Invoice`):
Doklad k zákazke, ktorý na pokyn Servisníka vystaví KROS Fakturácia. Číslo, PDF aj úhrady vedie KROS, Servisník faktúru sám nevystavuje.
_Avoid_: účet, doklad

**Stav faktúry** (`InvoiceStatus`):
Kde je faktúra na ceste do KROS: Odosiela sa, Prijatá, Vystavená, Odmietnutá, Neistá alebo Zmazaná v KROS.
_Avoid_: stav dokladu, stav úhrady (to je iný pojem)

**Platná faktúra** (`valid`):
Každá faktúra okrem odmietnutej a zmazanej v KROS. Zákazka má najviac jednu platnú faktúru.
_Avoid_: aktívna faktúra, aktuálna faktúra

**Neistá faktúra** (`uncertain`):
Faktúra, o ktorej Servisník nevie, či ju KROS prijal. Kým sa v KROS nedohľadá, nesmie sa poslať znova.
_Avoid_: visiaca, stratená faktúra

**Úhrada** (`Payment`):
Platba zákazníka, ktorú KROS priradil k faktúre. Faktúra môže mať viac úhrad.
_Avoid_: platba, splátka

**Stav úhrady** (`PaymentStatus`):
Koľko z faktúry zákazník zaplatil: Neuhradená, Čiastočne uhradená, Uhradená alebo Preplatená. Vedie ho KROS.
_Avoid_: stav platby

**eFaktúra** (`EInvoice`):
Faktúra pre firmu s DIČ, ktorú KROS doručí elektronicky cez sieť Peppol.
_Avoid_: elektronická faktúra, e-faktúra

### Zákazka v dielni

**Stav zákazky** (`WorkOrderStatus`):
Kde zákazka práve je: Prijatá (`received`), V práci (`inProgress`), Čaká na diely (`waitingForParts`), Hotová (`done`), Vyfakturovaná (`invoiced`) alebo Zrušená (`cancelled`).
_Avoid_: fáza, status

**Rozpracovaná zákazka** (`active`):
Zákazka v stave Prijatá, V práci alebo Čaká na diely.
_Avoid_: otvorená, aktívna

**Uzavretá zákazka** (`closed`):
Zákazka v stave Vyfakturovaná alebo Zrušená. Zrušená zákazka si ponechá svoje číslo.
_Avoid_: ukončená, archivovaná

**Termín** (`deadline`):
Deň, do ktorého autoservis zákazníkovi sľúbil vozidlo opraviť. Rozpracovaná zákazka po termíne je oneskorená.
_Avoid_: dátum odovzdania, splatnosť (tá patrí faktúre)

**Príjem vozidla** (`intake`):
Založenie zákazky, keď zákazník privezie vozidlo, prípadne aj s novým zákazníkom alebo vozidlom.
_Avoid_: check-in, prevzatie

### Ceny

**Cenník** (`PriceList`):
Zoznam prác a dielov s cenami, z ktorého autoservis pridáva položky na zákazku.
_Avoid_: katalóg, sortiment

**Položka cenníka** (`PriceListItem`):
Jedna práca alebo jeden diel v cenníku. Na zákazku sa skopíruje, takže neskoršia zmena cenníka zákazku nemení.
_Avoid_: produkt, karta

**Nákupná cena** (`purchasePrice`):
Cena za mernú jednotku bez DPH, za ktorú autoservis diel kúpil. Práca nákupnú cenu nemá.
_Avoid_: obstarávacia cena, náklad

**Predajná cena** (`salePrice`):
Cena za mernú jednotku, za ktorú autoservis prácu alebo diel predáva zákazníkovi.
_Avoid_: koncová cena, cena pre zákazníka

**Marža** (`margin`):
Rozdiel medzi predajnými a nákupnými cenami bez DPH, v eurách alebo v percentách z predajnej ceny.
_Avoid_: zisk (ten je až po réžii), rabat

**Prirážka** (`markup`):
Percento z nákupnej ceny, o ktoré je predajná cena dielu vyššia. Každý diel môže mať inú prirážku, aj nulovú.
_Avoid_: marža (tá sa počíta z predajnej ceny), navýšenie

**Zľava** (`discount`):
Zníženie ceny celej zákazky percentom alebo sumou, ktoré autoservis zákazníkovi dá. Platí na všetky položky zákazky.
_Avoid_: rabat, akcia

### Tlačivá a import

**Zákazkový list** (`JobSheet`):
Tlačivo pri príjme vozidla s údajmi zákazníka, vozidla a požiadavkou zákazníka, ktoré zákazník podpíše. Nemá ceny.
_Avoid_: objednávka, príjemka

**Cenová ponuka** (`Quote`):
Tlačivo s položkami zákazky a ich cenami, ktoré zákazník dostane pred opravou. Nemá vlastné číslo, nesie číslo zákazky.
_Avoid_: kalkulácia, rozpočet

**Odovzdávací protokol** (`HandoverProtocol`):
Tlačivo pri odovzdaní vozidla so zoznamom vykonaných prác a dielov, ktoré podpíše zákazník aj autoservis.
_Avoid_: preberací protokol, dodací list

**Import šablóna** (`ImportTemplate`):
Uložené priradenie stĺpcov súboru k údajom dielu, napríklad pre export z Partslinku.
_Avoid_: mapovanie, profil importu
