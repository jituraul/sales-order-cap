const cds = require('@sap/cds');

/**
 * Implementation of SalesService.
 * Contains custom logic for actions, functions, validations and
 * automatic calculation of order/item amounts.
 */
module.exports = class SalesService extends cds.ApplicationService {
  async init() {
    const { SalesOrders, OrderItems, Products } = this.entities;

    // ---------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------

    // Generate a human-readable order number.
    const nextOrderNo = async () => {
      const { count } = await SELECT.one`count(*) as count`.from(SalesOrders);
      return 'SO-' + String(1000 + Number(count || 0) + 1);
    };

    // Recalculate net amount of an item and the parent order total.
    // Used by handlers that write directly via INSERT/UPDATE (addItem, createOrder),
    // which bypass the generic CRUD event pipeline.
    const recalcOrderTotal = async (orderID) => {
      const items = await SELECT.from(OrderItems).where({ order_ID: orderID });
      const total = items.reduce((sum, it) => sum + Number(it.netAmount || 0), 0);
      await UPDATE(SalesOrders).set({ totalAmount: total }).where({ ID: orderID });
      return total;
    };

    // Price a single item line against its product; validates quantity too.
    // unitPrice is only looked up when missing (cheap on unmodified lines),
    // but netAmount is always recomputed from unitPrice * quantity so a
    // quantity-only change (e.g. a plain PATCH) is still reflected correctly.
    const priceItem = async (item, req) => {
      if (item.quantity != null && item.quantity <= 0) {
        return req.error(400, 'Quantity must be greater than zero');
      }
      const productID = item.product_ID || item.product?.ID;
      if (productID && item.unitPrice == null) {
        const product = await SELECT.one.from(Products).where({ ID: productID });
        if (!product) return req.error(404, `Product ${productID} not found`);
        item.unitPrice = product.price;
      }
      if (item.unitPrice != null && item.quantity != null) {
        item.netAmount = Number(item.unitPrice) * Number(item.quantity);
      }
    };

    // ---------------------------------------------------------------
    // BEFORE handlers — validation, defaulting & pricing
    // ---------------------------------------------------------------

    // NOTE ON DRAFTS: for a @odata.draft.enabled entity, CAP's lean-draft
    // implementation only dispatches generic CREATE/UPDATE events (which our
    // handlers can hook into) once at *draftActivate* time — the initial
    // "new draft" POST and any edits made to items while a draft is in
    // progress (add/remove/PATCH via the `items` navigation) do not go
    // through the normal CRUD event pipeline at all. At activation, however,
    // CAP dispatches a single CREATE (new order) or UPDATE (edited order)
    // event on SalesOrders whose payload includes the *complete* current
    // `items` array — so that is the one reliable place to default header
    // fields and (re)price every line item, including ones added via a
    // native OData deep create/update. Pricing here is defensive: it only
    // recomputes a line's unitPrice/netAmount when missing, so lines already
    // priced by the addItem action or createOrder action are left untouched.
    this.before(['CREATE', 'UPDATE'], SalesOrders, async (req) => {
      const o = req.data;
      if (req.event === 'CREATE') {
        if (!o.orderNo) o.orderNo = await nextOrderNo();
        if (!o.orderDate) o.orderDate = new Date().toISOString().slice(0, 10);
        if (!o.status) o.status = 'DRAFT';
      }

      if (Array.isArray(o.items)) {
        let total = 0;
        for (const item of o.items) {
          const result = await priceItem(item, req);
          if (result) return result; // req.error(...) was called
          total += Number(item.netAmount || 0);
        }
        o.totalAmount = total;
      }
    });

    // Covers direct (non-draft) create/update of a single OrderItems row,
    // e.g. via an admin/non-draft client. See note above for why draft-based
    // item changes are priced through the SalesOrders handler instead.
    this.before(['CREATE', 'UPDATE'], OrderItems, async (req) => priceItem(req.data, req));

    // ---------------------------------------------------------------
    // AFTER handlers — keep totals in sync for direct (non-draft) writes
    // ---------------------------------------------------------------

    this.after(['CREATE', 'UPDATE', 'DELETE'], OrderItems, async (_, req) => {
      const orderID = req.data?.order_ID;
      if (orderID) await recalcOrderTotal(orderID);
    });

    // ---------------------------------------------------------------
    // BOUND ACTIONS on SalesOrders
    // ---------------------------------------------------------------

    this.on('confirm', SalesOrders, async (req) => {
      const { ID } = req.params[0];
      const order = await SELECT.one.from(SalesOrders).where({ ID });
      if (!order) return req.error(404, 'Order not found');
      if (['CANCELLED', 'DELIVERED'].includes(order.status)) {
        return req.error(400, `Cannot confirm an order in status ${order.status}`);
      }
      await UPDATE(SalesOrders).set({ status: 'CONFIRMED' }).where({ ID });
      return SELECT.one.from(SalesOrders).where({ ID });
    });

    this.on('cancel', SalesOrders, async (req) => {
      const { ID } = req.params[0];
      const reason = req.data.reason;
      const order = await SELECT.one.from(SalesOrders).where({ ID });
      if (!order) return req.error(404, 'Order not found');
      if (order.status === 'DELIVERED') {
        return req.error(400, 'Delivered orders cannot be cancelled');
      }
      await UPDATE(SalesOrders)
        .set({ status: 'CANCELLED', note: reason ? `Cancelled: ${reason}` : order.note })
        .where({ ID });
      return SELECT.one.from(SalesOrders).where({ ID });
    });

    this.on('addItem', SalesOrders, async (req) => {
      const { ID } = req.params[0];
      const { product_ID, product, quantity } = req.data;
      const prodID = product_ID || product?.ID || product;
      const product_row = await SELECT.one.from(Products).where({ ID: prodID });
      if (!product_row) return req.error(404, 'Product not found');

      await INSERT.into(OrderItems).entries({
        order_ID: ID,
        product_ID: prodID,
        quantity: quantity || 1,
        unitPrice: product_row.price,
        netAmount: Number(product_row.price) * Number(quantity || 1)
      });
      await recalcOrderTotal(ID);
      return SELECT.one.from(SalesOrders).where({ ID });
    });

    // ---------------------------------------------------------------
    // BOUND FUNCTION on SalesOrders
    // ---------------------------------------------------------------

    this.on('getSummary', SalesOrders, async (req) => {
      const { ID } = req.params[0];
      const order = await SELECT.one.from(SalesOrders).where({ ID });
      if (!order) return req.error(404, 'Order not found');
      const items = await SELECT.from(OrderItems).where({ order_ID: ID });
      return {
        orderNo: order.orderNo,
        status: order.status,
        itemCount: items.length,
        totalAmount: order.totalAmount
      };
    });

    // ---------------------------------------------------------------
    // UNBOUND ACTIONS & FUNCTIONS
    // ---------------------------------------------------------------

    this.on('createOrder', async (req) => {
      const { customer, note, items = [] } = req.data;
      const orderID = cds.utils.uuid();
      const orderNo = await nextOrderNo();

      // Build line items with resolved prices.
      let total = 0;
      const itemEntries = [];
      for (const it of items) {
        const product = await SELECT.one.from(Products).where({ ID: it.product });
        if (!product) return req.error(404, `Product ${it.product} not found`);
        const net = Number(product.price) * Number(it.quantity || 1);
        total += net;
        itemEntries.push({
          ID: cds.utils.uuid(),
          order_ID: orderID,
          product_ID: it.product,
          quantity: it.quantity || 1,
          unitPrice: product.price,
          netAmount: net
        });
      }

      await INSERT.into(SalesOrders).entries({
        ID: orderID,
        orderNo,
        status: 'OPEN',
        orderDate: new Date().toISOString().slice(0, 10),
        customer_ID: customer,
        note,
        totalAmount: total
      });
      if (itemEntries.length) await INSERT.into(OrderItems).entries(itemEntries);

      return SELECT.one.from(SalesOrders).where({ ID: orderID });
    });

    this.on('getRevenueByStatus', async () => {
      const rows = await SELECT`status, count(*) as orderCount, sum(totalAmount) as totalAmount`
        .from(SalesOrders)
        .groupBy('status');
      return rows.map((r) => ({
        status: r.status,
        orderCount: Number(r.orderCount),
        totalAmount: Number(r.totalAmount || 0)
      }));
    });

    this.on('getLowStockProducts', async (req) => {
      const threshold = req.data.threshold ?? 10;
      return SELECT.from(Products).where({ stock: { '<': threshold } });
    });

    await super.init();
  }
};
