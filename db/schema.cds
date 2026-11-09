namespace sales;

using { cuid, managed, Currency } from '@sap/cds/common';

/**
 * Status values for a Sales Order.
 */
type OrderStatus : String enum {
  Draft      = 'DRAFT';
  Open       = 'OPEN';
  Confirmed  = 'CONFIRMED';
  Shipped    = 'SHIPPED';
  Delivered  = 'DELIVERED';
  Cancelled  = 'CANCELLED';
}

/**
 * Master data: Customers who place orders.
 */
entity Customers : cuid, managed {
  name        : String(100) not null;
  email       : String(120);
  phone       : String(30);
  country     : String(3); // ISO country code
  city        : String(60);
  street      : String(120);
  postalCode  : String(20);
  orders      : Association to many SalesOrders on orders.customer = $self;
}

/**
 * Master data: Products that can be ordered.
 */
entity Products : cuid, managed {
  name        : String(100) not null;
  description : String(500);
  sku         : String(40);
  stock       : Integer default 0;
  price       : Decimal(11, 2) not null;
  currency    : Currency;
  items       : Association to many OrderItems on items.product = $self;
}

/**
 * Transactional data: a Sales Order header.
 */
entity SalesOrders : cuid, managed {
  orderNo      : String(20);
  status       : OrderStatus default #Draft;
  orderDate    : Date;
  customer     : Association to Customers not null;
  items        : Composition of many OrderItems on items.order = $self;
  currency     : Currency;
  // Computed / derived totals
  totalAmount  : Decimal(15, 2) default 0;
  note         : String(1000);
  attachments  : Association to many Attachments on attachments.order = $self;
}

/**
 * Transactional data: Sales Order line items.
 */
entity OrderItems : cuid {
  order      : Association to SalesOrders not null;
  product    : Association to Products not null;
  quantity   : Integer not null default 1;
  unitPrice  : Decimal(11, 2);
  netAmount  : Decimal(15, 2);
}

/**
 * Files attached to a Sales Order (stored in the database).
 * Kept as an association rather than a composition so files can be
 * uploaded/deleted directly on an active order without going through
 * the draft edit cycle. They are removed with the order (see service).
 */
entity Attachments : cuid, managed {
  order     : Association to SalesOrders not null;
  @Core.MediaType: mediaType
  @Core.ContentDisposition.Filename: fileName
  @Core.ContentDisposition.Type: 'attachment'
  content   : LargeBinary;
  @Core.IsMediaType
  mediaType : String(127) default 'application/octet-stream';
  fileName  : String(255) not null;
  size      : Integer;
  note      : String(500);
}
