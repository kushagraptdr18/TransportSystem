-- Multi-product rates: one RateMaster row can now cover several products
-- (ticked together in the Rate Setup form). Empty array + null productId
-- still means "ALL products" fallback.
ALTER TABLE "RateMaster" ADD COLUMN IF NOT EXISTS "productIds" TEXT[] NOT NULL DEFAULT '{}';

-- Existing single-product rows fold into the new array so one code path
-- (productIds @> product) serves old and new rows alike.
UPDATE "RateMaster"
SET "productIds" = ARRAY["productId"]
WHERE "productId" IS NOT NULL AND cardinality("productIds") = 0;

-- rate lookup filters on array membership
CREATE INDEX IF NOT EXISTS "RateMaster_productIds_idx" ON "RateMaster" USING GIN ("productIds");
