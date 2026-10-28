ALTER TABLE "customer" ADD COLUMN "search_name" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "search_email" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "search_phone" text NOT NULL DEFAULT '';--> statement-breakpoint
-- Keys for the customers that exist already, the way the domain computes them (normalizeText and normalizePhone in
-- packages/domain/src/customer): without diacritics (decomposed, then every combining mark dropped), in lower case, white
-- space of any kind (a non-breaking space too) as single spaces. The marks are the combining blocks of Unicode, which is
-- every mark a Latin, Greek or Cyrillic letter decomposes into. From now on the DAL writes the keys with every save.
UPDATE "customer" SET
	"search_name" = btrim(regexp_replace(lower(regexp_replace(normalize("name", NFD), '[̀-ͯ᪰-᫿᷀-᷿⃐-⃿︠-︯]', '', 'g')), '[\s   -     　﻿]+', ' ', 'g')),
	"search_email" = btrim(regexp_replace(lower(regexp_replace(normalize(coalesce("email", ''), NFD), '[̀-ͯ᪰-᫿᷀-᷿⃐-⃿︠-︯]', '', 'g')), '[\s   -     　﻿]+', ' ', 'g')),
	"search_phone" = regexp_replace(regexp_replace(coalesce("phone", ''), '[^0-9]', '', 'g'), '^(00421|421|0)', '');--> statement-breakpoint
ALTER TABLE "customer" ALTER COLUMN "search_name" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "customer" ALTER COLUMN "search_email" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "customer" ALTER COLUMN "search_phone" DROP DEFAULT;
