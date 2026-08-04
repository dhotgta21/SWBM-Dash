# Task breakdown: SWBM bugfix campaign

## Features

| ID | Chunks | Depends |
|----|--------|---------|
| F-footer | C1 layout SiteFooter / BlogFooter / ShopFooter | - |
| F-guides | C1 tracing + remove generateStaticParams; C2 layout/loader harden | - |
| F-invoice-pdf | C1 InvoiceCreatedActions use invoiceId; C2 preview path server company/bank | - |
| F-address | C1 fix GoAddress empty check + map list | - |

## Order
1. F-address (clear one-liner root cause)
2. F-invoice-pdf (clear path mismatch)
3. F-footer (UI layout)
4. F-guides (production harden + align)

## Decisions
- Prefer `invoiceId` after create over widening client preview trust surface.
- Preview PDF path still reloads company/bank from DB when still used.
