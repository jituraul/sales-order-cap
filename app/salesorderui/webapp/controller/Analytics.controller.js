sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageBox",
  "../model/formatter"
], function (Controller, JSONModel, MessageBox, formatter) {
  "use strict";

  return Controller.extend("salesorderui.controller.Analytics", {

    formatter: formatter,

    onInit: function () {
      this.getView().setModel(new JSONModel({ rows: [] }), "revenue");
      this.onRefreshRevenue();
    },

    onRefreshRevenue: function () {
      // Use the owner component's model rather than the view's: this view is
      // nested inside App.view.xml via <mvc:XMLView>, so at onInit time (called
      // from here) the component's default model may not yet have propagated
      // down to this view - the component itself always has it, though.
      var oModel = this.getOwnerComponent().getModel();
      var oListBinding = oModel.bindList("/getRevenueByStatus()");
      oListBinding.requestContexts(0, 100).then(function (aContexts) {
        var aRows = aContexts.map(function (c) { return c.getObject(); });
        var fMax = aRows.reduce(function (m, r) { return Math.max(m, Number(r.totalAmount) || 0); }, 0) || 1;
        aRows.forEach(function (r) { r.share = Math.round((Number(r.totalAmount) || 0) / fMax * 100); });
        this.getView().getModel("revenue").setProperty("/rows", aRows);
      }.bind(this)).catch(function (e) { MessageBox.error((e && e.message) || String(e)); });
    }
  });
});
