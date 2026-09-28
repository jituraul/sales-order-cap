# Sales Order — SAP CAP Project

A complete **SAP Cloud Application Programming Model (CAP)** project implementing a
**Sales Order** scenario. It demonstrates full **CRUD**, **bound & unbound actions**,
**bound & unbound functions**, validations, and automatic amount calculation.

## Domain Model (`db/schema.cds`)

| Entity        | Purpose                                  |
|---------------|------------------------------------------|
| `Customers`   | Master data — who places orders          |
| `Products`    | Master data — what can be ordered        |
| `SalesOrders` | Transactional header (status, totals)    |
| `OrderItems`  | Composition of line items under an order |

`SalesOrders` → `OrderItems` is a **Composition** (deep create/delete).
`OrderItems` → `Products` and `SalesOrders` → `Customers` are **Associations**.

## Service (`srv/sales-service.cds` + `.js`)

Exposed at **`/sales`** as OData V4.

### CRUD
Standard create / read / update / delete on `Customers`, `Products`,
`SalesOrders` (draft-enabled) and `OrderItems`.

### Bound actions (on a SalesOrder)
- `confirm()` — moves status to `CONFIRMED`
- `cancel(reason)` — cancels with optional reason
- `addItem(product, quantity)` — adds a line, recalculates totals

### Bound function (on a SalesOrder)
- `getSummary()` — returns orderNo, status, itemCount, totalAmount

### Unbound action
- `createOrder(customer, note, items[])` — deep create of header + items

### Unbound functions
- `getRevenueByStatus()` — analytics grouped by status
- `getLowStockProducts(threshold)` — products below a stock level

### Business logic (`srv/sales-service.js`)
- Auto-generates `orderNo` (`SO-1001`, …) and `orderDate`
- Validates quantity > 0 and product existence
- Calculates `netAmount` per item and `totalAmount` per order
- Keeps order total in sync on item create/update/delete

## Sample Data
CSV seed files in `db/data/` are loaded automatically into SQLite.

## Run it

```bash
npm install            # install @sap/cds, sqlite driver, etc.
npm run watch          # or: cds watch
```

The server starts at <http://localhost:4004>. Open it to see the service index,
then explore metadata at `/sales/$metadata`.

## Try the endpoints
See `test/requests.http` (VS Code REST Client) for ready-to-run examples of every
CRUD operation, action and function.

## Tests
```bash
npm test               # Jest integration tests (test/sales-service.test.js)
```

## Deploy to persistent DB / SAP BTP
```bash
cds deploy --to sqlite        # local persistent file
cds build --production        # build for HANA / BTP deployment
```
