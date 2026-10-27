-- Overseas education, level 2 (Application Pro) is now Rs 7,999 (it was seeded at Rs 5,999).
-- Only a price still at the old seeded value is moved, so a price someone changed in the console is left alone. Idempotent.
UPDATE pay_prices pr JOIN pay_products p ON p.id = pr.product_id
SET pr.amount_minor = 799900
WHERE p.sku = 'abroad-application-pro' AND pr.currency = 'INR' AND pr.amount_minor = 599900;
