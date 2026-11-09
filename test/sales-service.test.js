const cds = require('@sap/cds');
const { GET, POST, PATCH, PUT, DELETE, expect } = cds.test(__dirname + '/..');

describe('SalesService', () => {
  const C1 = '11111111-1111-1111-1111-111111111111';
  const P1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const O1 = '99999999-0001-0001-0001-000000000001';

  it('READ - lists seeded sales orders', async () => {
    const { data } = await GET`/sales/SalesOrders`;
    expect(data.value.length).to.be.greaterThan(0);
  });

  it('CREATE - creates a new order', async () => {
    const { data } = await POST(`/sales/SalesOrders`, {
      customer_ID: C1,
      note: 'jest order'
    });
    expect(data.status).to.equal('DRAFT');
    expect(data.orderNo).to.match(/^SO-/);
  });

  it('UPDATE - patches a note', async () => {
    const { data } = await PATCH(`/sales/SalesOrders(${O1})`, { note: 'patched' });
    expect(data.note).to.equal('patched');
  });

  it('ACTION (unbound) - createOrder builds header + items with totals', async () => {
    const { data } = await POST(`/sales/createOrder`, {
      customer: C1,
      note: 'full order',
      items: [{ product: P1, quantity: 4 }]
    });
    expect(Number(data.totalAmount)).to.equal(100); // 4 * 25.00
    expect(data.status).to.equal('OPEN');
  });

  it('ACTION (bound) - confirm sets status', async () => {
    const { data } = await POST(
      `/sales/SalesOrders(${O1})/SalesService.confirm`, {}
    );
    expect(data.status).to.equal('CONFIRMED');
  });

  it('FUNCTION (bound) - getSummary returns counts', async () => {
    const { data } = await GET(
      `/sales/SalesOrders(${O1})/SalesService.getSummary()`
    );
    expect(data).to.have.property('itemCount');
    expect(data).to.have.property('totalAmount');
  });

  it('FUNCTION (unbound) - getLowStockProducts respects threshold', async () => {
    const { data } = await GET`/sales/getLowStockProducts(threshold=10)`;
    expect(data.value.every((p) => p.stock < 10)).to.be.true;
  });

  it('ATTACHMENTS - upload, download and delete with order', async () => {
    const { data: order } = await POST(`/sales/createOrder`, { customer: C1, note: 'with file', items: [] });
    const { data: att } = await POST(`/sales/Attachments`, {
      order_ID: order.ID, fileName: 'hello.txt', mediaType: 'text/plain', size: 5
    });
    await PUT(`/sales/Attachments(${att.ID})/content`, 'hello', {
      headers: { 'Content-Type': 'text/plain' }
    });
    const res = await GET(`/sales/Attachments(${att.ID})/content`);
    expect(res.data).to.equal('hello');
    expect(res.headers['content-disposition']).to.contain('hello.txt');

    await DELETE(`/sales/SalesOrders(ID=${order.ID},IsActiveEntity=true)`);
    const { data: left } = await GET(`/sales/Attachments?$filter=order_ID eq ${order.ID}`);
    expect(left.value.length).to.equal(0);
  });

  it('ATTACHMENTS - rejects unknown order', async () => {
    await expect(POST(`/sales/Attachments`, {
      order_ID: '00000000-0000-0000-0000-000000000000', fileName: 'x.txt'
    })).to.be.rejectedWith(/404|not found/i);
  });
});
