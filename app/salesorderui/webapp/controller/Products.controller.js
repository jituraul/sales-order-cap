sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/m/MessageToast",
  "sap/m/MessageBox"
], function (Controller, JSONModel, Filter, FilterOperator, MessageToast, MessageBox) {
  "use strict";

  var GROUP = "manage";

  return Controller.extend("salesorderui.controller.Products", {

    onInit: function () {
      this.getView().setModel(new JSONModel({ selected: null }), "ui");
    },

    onSearchProducts: function (oEvent) {
      var sQuery = oEvent.getParameter("query") || "";
      var aFilters = sQuery ? [new Filter("name", FilterOperator.Contains, sQuery)] : [];
      this.byId("productsTable").getBinding("items").filter(aFilters);
    },

    onProductSelectionChange: function (oEvent) {
      var oItem = oEvent.getParameter("listItem");
      this.getView().getModel("ui").setProperty("/selected", oItem ? oItem.getBindingContext() : null);
    },

    onCreateProduct: function () {
      var oModel = this.getView().getModel();
      this._oNewBinding = oModel.bindList("/Products", undefined, [], [], { $$updateGroupId: GROUP });
      var oContext = this._oNewBinding.create({
        name: "", description: "", sku: "", stock: 0, price: "0.00"
      });
      this._bNew = true;
      this._openDialog(oContext, false);
    },

    onEditProduct: function () {
      var oContext = this.getView().getModel("ui").getProperty("/selected");
      if (!oContext) { return; }
      this._bNew = false;
      this._openDialog(oContext, true);
    },

    _openDialog: function (oContext, bDeferredEdit) {
      this.loadFragment({ name: "salesorderui.fragment.ProductDialog" }).then(function (oDialog) {
        this._oDialog = oDialog;
        if (bDeferredEdit) {
          oDialog.bindElement({ path: oContext.getPath(), parameters: { $$updateGroupId: GROUP } });
        } else {
          oDialog.setBindingContext(oContext);
        }
        this._oEditContext = oContext;
        oDialog.open();
      }.bind(this));
    },

    onSaveProduct: function () {
      var oModel = this.getView().getModel();
      var bNew = this._bNew;
      oModel.submitBatch(GROUP)
        .then(function () {
          return bNew ? this._oEditContext.created() : Promise.resolve();
        }.bind(this))
        .then(function () {
          MessageToast.show(bNew ? "Product created" : "Product saved");
          this._oDialog.close();
          this.byId("productsTable").getBinding("items").refresh();
        }.bind(this))
        .catch(function (e) { MessageBox.error((e && e.message) || String(e)); });
    },

    onCancelProductDialog: function () {
      this.getView().getModel().resetChanges(GROUP);
      this._oDialog.close();
    },

    onDeleteProduct: function () {
      var oContext = this.getView().getModel("ui").getProperty("/selected");
      if (!oContext) { return; }
      MessageBox.confirm("Delete this product?", {
        onClose: function (sAction) {
          if (sAction !== MessageBox.Action.OK) { return; }
          oContext.delete().then(function () {
            MessageToast.show("Product deleted");
          }).catch(function (e) { MessageBox.error((e && e.message) || String(e)); });
        }
      });
    },

    // ---------------------------------------------------------------
    // Unbound function: getLowStockProducts(threshold)
    // ---------------------------------------------------------------

    onShowLowStock: function () {
      this._oLowStockModel = new JSONModel({ threshold: 10, results: [] });
      this.loadFragment({ name: "salesorderui.fragment.LowStockDialog" }).then(function (oDialog) {
        this._oLowStockDialog = oDialog;
        oDialog.setModel(this._oLowStockModel, "lowStock");
        oDialog.open();
        this.onSearchLowStock();
      }.bind(this));
    },

    onSearchLowStock: function () {
      var iThreshold = this._oLowStockModel.getProperty("/threshold") || 0;
      var oModel = this.getView().getModel();
      var oListBinding = oModel.bindList("/getLowStockProducts(threshold=" + iThreshold + ")");
      oListBinding.requestContexts(0, 100).then(function (aContexts) {
        var aResults = aContexts.map(function (c) { return c.getObject(); });
        this._oLowStockModel.setProperty("/results", aResults);
      }.bind(this)).catch(function (e) { MessageBox.error((e && e.message) || String(e)); });
    },

    onCloseLowStockDialog: function () {
      this._oLowStockDialog.close();
    }
  });
});
