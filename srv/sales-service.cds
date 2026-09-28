using sales from '../db/schema';

/**
 * SalesService — the main OData V4 service for the Sales Order scenario.
 * Provides full CRUD on all entities plus bound/unbound actions and functions.
 */
service SalesService @(path: '/sales') {

  // ---------- CRUD-enabled projections ----------

  entity Customers as projection on sales.Customers;

  entity Products  as projection on sales.Products;

  @odata.draft.enabled
  entity SalesOrders as projection on sales.SalesOrders actions {

    // Bound action: confirm this order (DRAFT/OPEN -> CONFIRMED)
    action confirm() returns SalesOrders;

    // Bound action: cancel this order
    action cancel(reason : String) returns SalesOrders;

    // Bound action: add a line item to this order
    action addItem(
      product  : UUID,
      quantity : Integer
    ) returns SalesOrders;

    // Bound function: get a computed summary of this order
    function getSummary() returns {
      orderNo     : String;
      status      : String;
      itemCount   : Integer;
      totalAmount : Decimal(15, 2);
    };
  };

  entity OrderItems as projection on sales.OrderItems;

  // ---------- Unbound (service-level) actions & functions ----------

  // Create a complete order (header + items) in one call.
  action createOrder(
    customer : UUID,
    note     : String,
    items    : many {
      product  : UUID;
      quantity : Integer;
    }
  ) returns SalesOrders;

  // Read-only analytics: revenue grouped by status.
  function getRevenueByStatus() returns many {
    status      : String;
    orderCount  : Integer;
    totalAmount : Decimal(15, 2);
  };

  // Read-only: list low-stock products below a threshold.
  function getLowStockProducts(threshold : Integer) returns many Products;
}
