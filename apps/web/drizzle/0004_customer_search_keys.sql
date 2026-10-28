ALTER TABLE "customer" ADD COLUMN "search_name" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "search_email" text NOT NULL DEFAULT '';--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "search_phone" text NOT NULL DEFAULT '';--> statement-breakpoint
-- Keys for the customers that exist already, the way the domain computes them (normalizeText and normalizePhone in
-- packages/domain/src/customer): the Slovak and Czech letters are mapped here, which is all a customer written
-- before this migration can hold; from now on the DAL writes the keys with every save.
UPDATE "customer" SET
	"search_name" = btrim(regexp_replace(lower(translate("name", 'áäčďéěíĺľňóôöŕřšťúůüýžÁÄČĎÉĚÍĹĽŇÓÔÖŔŘŠŤÚŮÜÝŽ', 'aacdeeillnooorrstuuuyzAACDEEILLNOOORRSTUUUYZ')), '\s+', ' ', 'g')),
	"search_email" = btrim(regexp_replace(lower(translate(coalesce("email", ''), 'áäčďéěíĺľňóôöŕřšťúůüýžÁÄČĎÉĚÍĹĽŇÓÔÖŔŘŠŤÚŮÜÝŽ', 'aacdeeillnooorrstuuuyzAACDEEILLNOOORRSTUUUYZ')), '\s+', ' ', 'g')),
	"search_phone" = regexp_replace(regexp_replace(coalesce("phone", ''), '\D', '', 'g'), '^(00421|421|0)', '');--> statement-breakpoint
ALTER TABLE "customer" ALTER COLUMN "search_name" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "customer" ALTER COLUMN "search_email" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "customer" ALTER COLUMN "search_phone" DROP DEFAULT;
