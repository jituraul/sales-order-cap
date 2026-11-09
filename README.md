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
| `Attachments` | Files (stored in DB) attached to an order |

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

---

# Application Flow (per tab)

## Overall architecture

1. **Shell**: `app/salesorderui/webapp/view/App.view.xml` is one page with an `IconTabBar` holding four tabs: **Orders, Customers, Products, Analytics**. Each tab embeds its own XML view and controller.
2. **Data**: `manifest.json` points the default model at the OData V4 service `/sales/`.
3. **Backend**: `srv/sales-service.cds` exposes `Customers`, `Products`, `SalesOrders` (draft-enabled), `OrderItems` and `Attachments`, plus custom actions and functions. Every call needs the `SalesUser` role.
4. **Logic**: `srv/sales-service.js` handles validation, pricing, totals, status changes and attachments.
5. **Saving**: The Customers, Products and order deep-create flows queue their changes in the update group `"manage"`. Nothing reaches the server until `submitBatch("manage")` runs. Cancelling calls `resetChanges` to throw the queued changes away.

## Tab 1: Orders

This is the largest tab. A `NavContainer` switches between a **List page** and a **Detail page** (`view/Orders.view.xml`).

### A. List page
1. **Load**: The table reads `GET /SalesOrders?$filter=IsActiveEntity eq true&$expand=customer&$orderby=orderNo desc`. That returns saved orders only (no drafts), with the customer name. An icon appears on rows that have an open draft (`HasDraftEntity`).
2. **Search**: Filters by `orderNo contains <text>` and keeps the `IsActiveEntity` filter.
3. **Refresh**: Reloads the list.
4. **Select a row, then Delete**: Sends `DELETE` on the order. On the server, the `before DELETE` handler also deletes that order's attachments. It skips this when only a draft is being discarded.
5. **Click a row**: `_showOrderDetail` binds the detail page to the order, loads its attachments, and opens the detail page.

### B. Create order, way 1: "Deep create" (draft-based)
1. `onCreateOrderDeep` creates a new `SalesOrders` context in the `"manage"` group and opens `CreateOrderDialog`.
2. The user enters header fields. **Add item** opens the shared item picker (product and quantity). The item is added to the new order's `items` with the price filled in for display.
3. **Confirm**:
   - `submitBatch` sends one POST with the header and all items, which creates a **draft**.
   - `draftActivate` turns the draft into a saved order.
   - On the server, the `before CREATE` handler on `SalesOrders` sets `orderNo` (`SO-1001`, `SO-1002`, …), `orderDate` and `status = DRAFT`. It also prices every item (`unitPrice` from the product, `netAmount = price × qty`) and calculates `totalAmount`.
4. **Cancel**: Throws away the queued changes. If the draft was already sent to the server, it deletes it.

### C. Create order, way 2: "Quick create" (unbound `createOrder` action)
1. Opens `QuickCreateOrderDialog`, which uses a local JSON model (customer, note, items).
2. Items come from the same picker and are kept only in the browser.
3. **Confirm**: Sends `POST /createOrder` with `{customer, note, items[]}`.
4. On the server, the `createOrder` handler creates the order number and prices each item. It inserts the header with `status = OPEN` and inserts the items. There's no draft, so the order is saved straight away.

### D. Detail page: view mode
The form shows order number, status, customer, date, currency, note and total. Below it are the **Items** table and the **Attachments** table. The toolbar buttons are:

| Button | Call | What the server does |
|---|---|---|
| **Confirm** | bound action `confirm` | Sets status to `CONFIRMED`. Refuses if the order is `CANCELLED` or `DELIVERED`. |
| **Cancel** | opens a reason dialog, then bound action `cancel(reason)` | Sets status to `CANCELLED` and writes `"Cancelled: <reason>"` into the note. Refuses if the order is `DELIVERED`. |
| **Add Item (action)** | picker, then bound action `addItem(product, quantity)` | Inserts a priced item directly and recalculates the total. |
| **Summary** | bound function `getSummary()` | Returns order number, status, item count and total, shown in a message box. |
| **Delete** | `DELETE` | Deletes the order and its attachments, then goes back to the list. |

### E. Detail page: edit mode (draft "deep update")
1. **Edit**: Calls `draftEdit` on the saved order, which makes a draft copy. The page switches to the draft and `ui>/editing = true`. A warning strip appears and the form fields become editable.
2. While editing:
   - **Add item**: The picker adds an item to the draft.
   - **Change quantity**: The row's `netAmount` and the order total are recalculated in the browser right away (`onQuantityChange`, `_refreshOrderTotal`), then refreshed from the server where possible.
   - **Delete item**: Removes the item from the draft and recalculates the total.
3. **Save**: Calls `draftActivate`. On the server, the `before UPDATE` handler receives the full `items` list and re-prices it. This is the only point where the server reliably prices draft changes (see the comment in `srv/sales-service.js`). The page switches back to the saved order.
4. **Discard**: Deletes the draft and goes back to the order as it was before editing.

### F. Attachments (on the detail page, any mode)
1. When the detail page opens, the attachments table is filtered by `order_ID`. Attachments are linked by order ID, so they don't depend on editing or saving the order.
2. **Upload** is done in two steps:
   - The browser checks the file is under 10 MB.
   - It POSTs the attachment details (`fileName`, `mediaType`, `size`, `order_ID`). On the server, `before CREATE` checks the file name, the size limit and that the order exists.
   - It PUTs the file itself to `/Attachments(<ID>)/content`, first fetching a CSRF token. If the upload fails, it deletes the details row so no empty entry is left behind.
3. **Download**: Clicking the file name opens `/Attachments(<ID>)/content`.
4. **Delete**: Sends `DELETE` on the attachment row.

## Tab 2: Customers (`controller/Customers.controller.js`)
1. **Load**: `GET /Customers?$orderby=name`.
2. **Search**: `name contains <text>`.
3. **Create**: Creates a new blank customer in the `"manage"` group and opens `CustomerDialog`. **Save** calls `submitBatch`, which sends the POST, then refreshes the table.
4. **Edit** (needs a selected row): Opens the dialog on the selected customer. Changes are queued and sent as a PATCH on Save.
5. **Cancel**: Throws away the queued changes.
6. **Delete**: Asks for confirmation, then sends `DELETE /Customers(ID)`.

There's no custom server logic here. It's plain CAP CRUD.

## Tab 3: Products (`controller/Products.controller.js`)
1. Steps 1–6 work the same way as on Customers, using `ProductDialog`. The table shows name, SKU, stock and price.
2. **Low Stock** opens `LowStockDialog` with a threshold that defaults to 10. It calls the unbound function `GET /getLowStockProducts(threshold=N)`, which returns products with `stock < N`. Changing the threshold and searching runs the function again.

## Tab 4: Analytics (`controller/Analytics.controller.js`)
1. When the tab loads, and each time **Refresh** is pressed, it calls the unbound function `GET /getRevenueByStatus()`.
2. On the server, this groups `SalesOrders` by `status` and returns the order count and the sum of `totalAmount` for each status.
3. In the browser, each row gets a `share` percentage relative to the largest total. That value drives the progress bar in the last column. The status is colour-coded by `formatter.statusState`.
4. This tab only reads data. It sums every order in the table, including drafts that have never been saved.

## How pricing and totals are kept correct

| How the order was changed | Where prices and totals are calculated |
|---|---|
| Deep create or draft edit, then Save | `before CREATE/UPDATE` on `SalesOrders` at activation |
| `createOrder` action | Inside the `createOrder` handler |
| `addItem` action | Inside the handler, plus `recalcOrderTotal` |
| Direct `OrderItems` changes (not through a draft) | `before` and `after` handlers on `OrderItems` |
| Editing in the UI before Save | Calculated in the browser for display only; the server's numbers apply on Save |

---

# Rebuild Guide: SAP Business Application Studio (step by step)

This guide rebuilds the project for practice. The order is backend first, then the simplest tab, ending with the hardest (Orders). Each phase leaves you with something that runs and that you can test before moving on.

## Phase 0: Set up the dev space and project

1. In BAS, create a dev space of type **Full Stack Cloud Application** and start it.
2. Open a terminal (**Terminal → New Terminal**) and run:
   ```bash
   cd ~/projects
   cds init sales-order-cap
   cd sales-order-cap
   npm add @sap/cds express
   npm add -D @cap-js/sqlite
   ```
3. Run `cds watch`. It should report "No models found" without crashing. Stop it with Ctrl+C.

## Phase 1: Data model and sample data

1. Create **`db/schema.cds`**. Build it in this order and save after each step:
   - `namespace sales;` and `using { cuid, managed, Currency } from '@sap/cds/common';`
   - The `OrderStatus` enum type.
   - `Customers`, then `Products`. Learn here what `cuid` (UUID key) and `managed` (createdAt/By fields) give you.
   - `SalesOrders`, with `customer : Association to Customers` and `items : Composition of many OrderItems`.
   - `OrderItems`, with back-links to `order` and `product`.
   - Leave **Attachments** out for now; you add it in Phase 5.
2. Create the CSV files in **`db/data/`**. The file name must be `<namespace>-<Entity>.csv`:
   - `sales-Customers.csv`, `sales-Products.csv`, `sales-SalesOrders.csv`, `sales-OrderItems.csv`
   - Foreign keys use `_ID` columns (`customer_ID`, `order_ID`, `product_ID`), and currency is `currency_code`.
3. If you want EUR/USD names, add currency data: `npm add @sap/cds-common-content` and add `using from '@sap/cds-common-content';` to the schema.

The model has no service yet, so there's nothing to check in the browser until Phase 2.

## Phase 2: Basic CRUD service, no custom code yet

1. Create **`srv/sales-service.cds`**:
   ```cds
   using sales from '../db/schema';
   service SalesService @(path: '/sales') {
     entity Customers   as projection on sales.Customers;
     entity Products    as projection on sales.Products;
     entity SalesOrders as projection on sales.SalesOrders;
     entity OrderItems  as projection on sales.OrderItems;
   }
   ```
   Leave out `requires: 'SalesUser'` and `@odata.draft.enabled` for now.
2. Run `cds watch` and open the port-4004 URL from the BAS popup. You should see these work:
   - `/sales/Customers`
   - `/sales/SalesOrders?$expand=customer,items($expand=product)`
3. Create **`test/requests.http`** and practise raw OData (BAS has a REST client: click "Send Request"):
   ```http
   ### Create a customer
   POST http://localhost:4004/sales/Customers
   Content-Type: application/json

   { "name": "Test Ltd", "city": "Pune" }

   ### Update it
   PATCH http://localhost:4004/sales/Customers(<ID>)
   Content-Type: application/json

   { "city": "Mumbai" }

   ### Delete it
   DELETE http://localhost:4004/sales/Customers(<ID>)
   ```
   **Check:** create, read, update and delete all work with no JavaScript written.

## Phase 3: Custom logic in small steps

Create **`srv/sales-service.js`** with an empty class first:
```js
const cds = require('@sap/cds');
module.exports = class SalesService extends cds.ApplicationService {
  async init() {
    const { SalesOrders, OrderItems, Products } = this.entities;
    // handlers go here
    await super.init();
  }
};
```
Then add one feature at a time. After each one, test it from `requests.http`.

| Step | Add to the `.cds` file | Add to the `.js` file | Test |
|---|---|---|---|
| 3.1 | nothing | the `nextOrderNo` helper and a `before('CREATE', SalesOrders)` handler that sets orderNo, orderDate and status | POST an order with no orderNo: you get `SO-10xx` back |
| 3.2 | nothing | the `priceItem` helper and a `before(['CREATE','UPDATE'], OrderItems)` handler | POST an item with only product and quantity: unitPrice and netAmount are filled in |
| 3.3 | nothing | `recalcOrderTotal` and `after(['CREATE','UPDATE','DELETE'], OrderItems)` | the order's `totalAmount` changes |
| 3.4 | `action confirm()` and `action cancel(reason)` inside `actions { }` on SalesOrders | `this.on('confirm', SalesOrders, …)` and `on('cancel', …)` | `POST /sales/SalesOrders(<ID>)/SalesService.confirm` with body `{}` |
| 3.5 | `action addItem(product: UUID, quantity: Integer)` | the `on('addItem')` handler | same POST pattern, with body `{"product":"…","quantity":2}` |
| 3.6 | `function getSummary() returns {…}` | the `on('getSummary')` handler | `GET /sales/SalesOrders(<ID>)/SalesService.getSummary()` |
| 3.7 | the unbound `action createOrder(...)` | the `on('createOrder')` handler | `POST /sales/createOrder` with customer and items |
| 3.8 | `function getRevenueByStatus()` and `function getLowStockProducts(threshold)` | their handlers | `GET /sales/getRevenueByStatus()` and `GET /sales/getLowStockProducts(threshold=10)` |

Two rules to remember:
- **Bound** actions and functions are called through an entity: `SalesOrders(<ID>)/SalesService.<name>`.
- **Unbound** ones are called at the service root: `/sales/<name>`.

## Phase 4: Turn on drafts

1. Add `@odata.draft.enabled` above `entity SalesOrders`.
2. Change the `before('CREATE')` handler to `before(['CREATE','UPDATE'], SalesOrders)` and add the loop that prices `o.items`. While an order is a draft, CAP doesn't run your item handlers. It runs them once, on activation, with the full list of items.
3. Test the draft lifecycle in `.http`:
   ```
   POST   /sales/SalesOrders                                        → new draft (IsActiveEntity=false)
   POST   /sales/SalesOrders(ID=…,IsActiveEntity=false)/items        → add an item to the draft
   POST   /sales/SalesOrders(ID=…,IsActiveEntity=false)/SalesService.draftActivate   → save
   POST   /sales/SalesOrders(ID=…,IsActiveEntity=true)/SalesService.draftEdit       → edit again
   ```
   After drafts are on, every key needs both `ID=…` and `IsActiveEntity=…`. That includes the bound-action calls from Phase 3.
4. **Check:** after activation, the order has an orderNo and the right total.

## Phase 5: Attachments

1. Add the `Attachments` entity to the schema (`content : LargeBinary` with the `@Core.MediaType` annotations). Add `attachments : Association to many Attachments` on SalesOrders.
2. Expose it in the service: `entity Attachments as projection on sales.Attachments;`
3. In the JS file, add the `before('CREATE', Attachments)` validation and the `before('DELETE', SalesOrders)` cleanup.
4. Test the two-step upload:
   ```http
   POST /sales/Attachments        { "order_ID": "...", "fileName": "a.txt", "mediaType": "text/plain" }
   PUT  /sales/Attachments(<ID>)/content
   Content-Type: text/plain

   hello world
   ```
   Then open `GET /sales/Attachments(<ID>)/content` in the browser. It should download the file.

The backend is now complete. Next comes the UI.

## Phase 6: UI skeleton

`cds watch` automatically serves anything under `app/`, so you don't need a separate UI server.

1. Create the folders `app/salesorderui/webapp/` with `controller/`, `view/`, `fragment/`, `model/`, `i18n/` and `css/` inside.
2. Add these files:
   - **`index.html`**: the UI5 bootstrap from the CDN. It creates the `ComponentContainer`.
   - **`Component.js`**: a `UIComponent` with `manifest: "json"`.
   - **`manifest.json`**. The important parts are:
     - `dataSources.mainService.uri = "/sales/"` with `odataVersion 4.0`.
     - The default model `""` of type `sap.ui.model.odata.v4.ODataModel` with `autoExpandSelect: true`.
     - The `i18n` model.
   - **`i18n/i18n.properties`**: start with `appTitle`, `tabOrders`, `tabCustomers`, `tabProducts` and `tabAnalytics`, and add keys as you go.
   - **`view/App.view.xml`**: the `IconTabBar` with four `IconTabFilter`s. At first, put a `<Text text="todo"/>` in each tab.
   - **`controller/App.controller.js`**: an empty controller.
   - **`model/formatter.js`**: `statusState` and `fileSize`.
3. **Check:** the 4004 page lists `/salesorderui/webapp/index.html`. Open it and you should see four empty tabs.

## Phase 7: Customers tab (learn the CRUD pattern once)

Build it in this order:
1. **The view, list only.** Add a `Table` with `items="{path:'/Customers', parameters:{$orderby:'name'}}"` and swap the tab's Text for `<mvc:XMLView viewName="salesorderui.view.Customers"/>`. **Check:** rows appear.
2. **Search.** Add a `SearchField` and `onSearchCustomers`, which applies a `Filter("name", Contains, query)`.
3. **Row selection.** Add `mode="SingleSelectMaster"` and a local `ui` JSONModel with `/selected`. Edit and Delete are enabled only when a row is selected.
4. **Delete.** Confirm with a `MessageBox`, then call `oContext.delete()`.
5. **Create and Edit dialog.** Add the `fragment/CustomerDialog.fragment.xml` fragment and these steps:
   - Create: `bindList("/Customers", …, {$$updateGroupId:"manage"}).create({...})`, then `dialog.setBindingContext(ctx)`.
   - Edit: `dialog.bindElement({path, parameters:{$$updateGroupId:"manage"}})`.
   - Save: `model.submitBatch("manage")`. Cancel: `model.resetChanges("manage")`.

   **Key concept:** the `"manage"` group holds changes in the browser until Save, so Cancel can throw them away.

## Phase 8: Products tab

1. Repeat the steps from Phase 7 for Products, using `ProductDialog`.
2. Add the **Low Stock** button and `LowStockDialog`, which uses a local JSON model `{threshold, results}`. To call the function:
   ```js
   oModel.bindList("/getLowStockProducts(threshold=" + n + ")").requestContexts(0,100)
   ```
   This teaches you how to call an **unbound function** from UI5.

## Phase 9: Analytics tab

1. In `onInit`, call `/getRevenueByStatus()` the same way.
2. Put the result into a JSON model `revenue>/rows`, then work out each row's `share` %.
3. Show it in a table with `ObjectStatus` (using `formatter.statusState`) and `ProgressIndicator`.

Use `this.getOwnerComponent().getModel()` in `onInit` here. The view's own model isn't available yet at that point.

## Phase 10: Orders tab (build it in this order)

1. **List page.** A `NavContainer` with one page holding the table:
   - Bind `/SalesOrders` with `$filter:'IsActiveEntity eq true'`, `$expand:'customer'` and `$orderby:'orderNo desc'`.
   - Add the draft icon column (`HasDraftEntity`), Search, Refresh and Delete.
2. **Detail page, read-only.** Add a second page in the `NavContainer`:
   - On row press, call `setBindingContext(ctx)` and `nav.to(detailPage)`.
   - Show a `SimpleForm` with the header fields and an items table bound to the relative path `items`.
3. **Bound actions.** Add Confirm, Cancel (with a reason fragment), Add Item and Summary, all through `_executeBoundAction`:
   ```js
   oModel.bindContext("SalesService.confirm(...)", oContext).execute()
   ```
   Build the shared **ItemPickerDialog** at this step. It returns a Promise, and the Orders tab uses it in three places.
4. **Quick create** (unbound action). Add the `QuickCreateOrderDialog` with its own JSON model, then:
   ```js
   bindContext("/createOrder(...)").setParameter(...).execute()
   ```
5. **Deep create** (draft):
   - Use `bindList("/SalesOrders",…,{$$updateGroupId:"manage"}).create()` with `CreateOrderDialog`.
   - Items go into the dialog's `items` table through `binding.create()`.
   - On Confirm: `submitBatch`, then `created()`, then `draftActivate`.
6. **Edit mode** (draft edit):
   - Edit: `draftEdit(...)`, then bind the page to the draft context and set `ui>/editing = true`.
   - Make the fields editable by binding them to `{ui>/editing}`. Add or remove items and handle quantity changes, with a browser-side total.
   - Save: `draftActivate(...)`. Discard: `draftContext.delete()`.
7. **Attachments.**
   - The table is bound to `/Attachments` with `suspended:true`. When the detail page opens, filter it by `order_ID` and resume it.
   - Use a `FileUploader` with `buttonOnly`. On file selection, create the details row, then `fetch PUT …/content` with a CSRF token.
   - Show the file name as a `Link` with an href to `…/content`.

**Check:** after each numbered step, run that feature once in the browser before starting the next.

## Phase 11: Optional extras, once everything works

1. **Tests:** `npm add -D jest @sap/cds-dk axios chai chai-as-promised chai-subset`, then write `test/sales-service.test.js` using `cds.test(__dirname + '/..')`.
2. **Security:**
   - Add `requires: 'SalesUser'` on the service.
   - Add the dev/production profiles in `package.json` (`auth: dummy` locally, `xsuaa` in production).
   - Create `xs-security.json`.
3. **Deploy to BTP:**
   - `cds add hana,xsuaa,mta,approuter` generates most of `mta.yaml` and `app/router`.
   - Then run `npm run build:ui`, `mbt build` and `cf deploy`.

## BAS tips
- Keep `cds watch` running. It restarts by itself whenever you save a `.cds` or `.js` file.
- Use the **CDS Graphical Modeler** (right-click `schema.cds`) to see the entity relationships.
- When something fails in the UI, open browser DevTools → **Network → `$batch`**. The real OData error is in the response.
- Commit after every phase (`git commit -m "Phase 3.4 confirm/cancel"`), so you can always go back to a version that worked.
