sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "../model/formatter"
], function (Controller, JSONModel, Filter, FilterOperator, MessageToast, MessageBox, formatter) {
  "use strict";

  var GROUP = "manage";

  return Controller.extend("salesorderui.controller.Orders", {

    formatter: formatter,

    onInit: function () {
      this.getView().setModel(new JSONModel({
        editing: false,
        selectedOrder: null,
        busy: false
      }), "ui");

      var vBundle = this.getOwnerComponent().getModel("i18n").getResourceBundle();
      if (vBundle && typeof vBundle.then === "function") {
        vBundle.then(function (oBundle) { this._oBundle = oBundle; }.bind(this));
      } else {
        this._oBundle = vBundle;
      }
    },

    // ---------------------------------------------------------------
    // List
    // ---------------------------------------------------------------

    onRefreshOrders: function () {
      this.byId("ordersTable").getBinding("items").refresh();
    },

    onSearchOrders: function (oEvent) {
      var sQuery = oEvent.getParameter("query") || "";
      var aFilters = [new Filter("IsActiveEntity", FilterOperator.EQ, true)];
      if (sQuery) {
        aFilters.push(new Filter("orderNo", FilterOperator.Contains, sQuery));
      }
      this.byId("ordersTable").getBinding("items").filter(new Filter({ filters: aFilters, and: true }));
    },

    onOrderSelectionChange: function (oEvent) {
      var oItem = oEvent.getParameter("listItem");
      this.getView().getModel("ui").setProperty("/selectedOrder", oItem ? oItem.getBindingContext() : null);
    },

    onOrderPress: function (oEvent) {
      var oContext = oEvent.getSource().getBindingContext();
      this._showOrderDetail(oContext);
    },

    onDeleteOrder: function () {
      var oContext = this.getView().getModel("ui").getProperty("/selectedOrder");
      if (!oContext) { return; }
      MessageBox.confirm(this._i18n("confirmDeleteOrder"), {
        onClose: function (sAction) {
          if (sAction !== MessageBox.Action.OK) { return; }
          oContext.delete().then(function () {
            MessageToast.show(this._i18n("orderDeleted"));
          }.bind(this)).catch(this._error.bind(this));
        }.bind(this)
      });
    },

    // ---------------------------------------------------------------
    // Navigation
    // ---------------------------------------------------------------

    _showOrderDetail: function (oContext) {
      this._oActiveContext = oContext;
      var oUi = this.getView().getModel("ui");
      oUi.setProperty("/editing", false);
      this.byId("orderDetailPage").setBindingContext(oContext);
      this.byId("ordersNavContainer").to(this.byId("orderDetailPage"));
    },

    onNavBack: function () {
      this.byId("ordersNavContainer").back();
    },

    // ---------------------------------------------------------------
    // Deep create: SalesOrders header + OrderItems in a single request
    // ---------------------------------------------------------------

    onCreateOrderDeep: function () {
      var oModel = this.getView().getModel();
      this._oDeepCreateBinding = oModel.bindList("/SalesOrders", undefined, [], [], { $$updateGroupId: GROUP });
      var oNewContext = this._oDeepCreateBinding.create({
        note: "",
        orderDate: new Date().toISOString().slice(0, 10)
      });
      this._oNewOrderContext = oNewContext;
      this._bDeepCreateSubmitted = false;

      this.loadFragment({ name: "salesorderui.fragment.CreateOrderDialog" }).then(function (oDialog) {
        this._oCreateOrderDialog = oDialog;
        oDialog.setModel(this.getView().getModel("ui"), "ui");
        oDialog.setBindingContext(oNewContext);
        oDialog.open();
      }.bind(this));
    },

    onAddDeepCreateItem: function () {
      this._pickProductAndQuantity().then(function (oResult) {
        if (!oResult) { return; }
        var oItemsBinding = this.byId("deepCreateItemsTable").getBinding("items");
        oItemsBinding.create({
          product_ID: oResult.productID,
          product: { ID: oResult.productID, name: oResult.productLabel, currency_code: oResult.productCurrency },
          quantity: oResult.quantity,
          unitPrice: oResult.productPrice,
          netAmount: oResult.productPrice != null ? oResult.productPrice * oResult.quantity : null
        });
      }.bind(this));
    },

    onRemoveDeepCreateItem: function (oEvent) {
      oEvent.getSource().getBindingContext().delete();
    },

    onConfirmCreateOrderDeep: function () {
      var oModel = this.getView().getModel();
      var oUi = this.getView().getModel("ui");
      oUi.setProperty("/busy", true);

      var pSubmit = this._bDeepCreateSubmitted ? Promise.resolve() : oModel.submitBatch(GROUP);
      this._bDeepCreateSubmitted = true;

      pSubmit
        .then(function () { return this._oNewOrderContext.created(); }.bind(this))
        .then(function () {
          var oActivate = oModel.bindContext("SalesService.draftActivate(...)", this._oNewOrderContext);
          return oActivate.execute();
        }.bind(this))
        .then(function () {
          MessageToast.show(this._i18n("orderCreated"));
          this._oCreateOrderDialog.close();
          this.byId("ordersTable").getBinding("items").refresh();
        }.bind(this))
        .catch(this._error.bind(this))
        .finally(function () { oUi.setProperty("/busy", false); });
    },

    onCancelCreateOrderDeep: function () {
      var oModel = this.getView().getModel();
      if (!this._bDeepCreateSubmitted) {
        oModel.resetChanges(GROUP);
      } else {
        this._oNewOrderContext.delete().catch(function () {});
      }
      this._oCreateOrderDialog.close();
    },

    // ---------------------------------------------------------------
    // Quick create via the unbound "createOrder" action
    // ---------------------------------------------------------------

    onCreateOrderAction: function () {
      this._oQuickCreateModel = new JSONModel({ customer: null, note: "", items: [] });
      this.loadFragment({ name: "salesorderui.fragment.QuickCreateOrderDialog" }).then(function (oDialog) {
        this._oQuickCreateDialog = oDialog;
        oDialog.setModel(this._oQuickCreateModel, "quick");
        oDialog.open();
      }.bind(this));
    },

    onQuickAddItem: function () {
      this._pickProductAndQuantity().then(function (oResult) {
        if (!oResult) { return; }
        var aItems = this._oQuickCreateModel.getProperty("/items");
        aItems.push({ product: oResult.productID, productLabel: oResult.productLabel, quantity: oResult.quantity });
        this._oQuickCreateModel.setProperty("/items", aItems);
      }.bind(this));
    },

    onQuickRemoveItem: function (oEvent) {
      var oCtx = oEvent.getSource().getBindingContext("quick");
      var iIndex = parseInt(oCtx.getPath().split("/").pop(), 10);
      var aItems = this._oQuickCreateModel.getProperty("/items");
      aItems.splice(iIndex, 1);
      this._oQuickCreateModel.setProperty("/items", aItems);
    },

    onConfirmCreateOrderAction: function () {
      var oModel = this.getView().getModel();
      var oData = this._oQuickCreateModel.getData();
      if (!oData.customer) {
        MessageBox.error(this._i18n("selectCustomer"));
        return;
      }
      var oAction = oModel.bindContext("/createOrder(...)");
      oAction.setParameter("customer", oData.customer);
      oAction.setParameter("note", oData.note || "");
      oAction.setParameter("items", oData.items.map(function (it) {
        return { product: it.product, quantity: it.quantity };
      }));

      oAction.execute().then(function () {
        MessageToast.show(this._i18n("orderCreated"));
        this._oQuickCreateDialog.close();
        this.byId("ordersTable").getBinding("items").refresh();
      }.bind(this)).catch(this._error.bind(this));
    },

    onCancelCreateOrderAction: function () {
      this._oQuickCreateDialog.close();
    },

    // ---------------------------------------------------------------
    // Draft-based edit (deep update)
    // ---------------------------------------------------------------

    onEditOrder: function () {
      var oModel = this.getView().getModel();
      var oActiveContext = this.byId("orderDetailPage").getBindingContext();
      var oEdit = oModel.bindContext("SalesService.draftEdit(...)", oActiveContext);
      oEdit.setParameter("PreserveChanges", false);

      oEdit.execute().then(function () {
        var oDraftContext = oEdit.getBoundContext();
        this._oActiveContextBeforeEdit = oActiveContext;
        this.byId("orderDetailPage").setBindingContext(oDraftContext);
        this.getView().getModel("ui").setProperty("/editing", true);
      }.bind(this)).catch(this._error.bind(this));
    },

    onSaveOrder: function () {
      var oModel = this.getView().getModel();
      var oDraftContext = this.byId("orderDetailPage").getBindingContext();
      var oActivate = oModel.bindContext("SalesService.draftActivate(...)", oDraftContext);

      oActivate.execute().then(function () {
        var oActiveContext = oActivate.getBoundContext();
        this.byId("orderDetailPage").setBindingContext(oActiveContext);
        this.getView().getModel("ui").setProperty("/editing", false);
        MessageToast.show(this._i18n("orderSaved"));
        this.byId("ordersTable").getBinding("items").refresh();
      }.bind(this)).catch(this._error.bind(this));
    },

    onDiscardOrder: function () {
      var oDraftContext = this.byId("orderDetailPage").getBindingContext();
      MessageBox.confirm(this._i18n("confirmDiscard"), {
        onClose: function (sAction) {
          if (sAction !== MessageBox.Action.OK) { return; }
          oDraftContext.delete().then(function () {
            this.byId("orderDetailPage").setBindingContext(this._oActiveContextBeforeEdit);
            this.getView().getModel("ui").setProperty("/editing", false);
          }.bind(this)).catch(this._error.bind(this));
        }.bind(this)
      });
    },

    onAddDraftItem: function () {
      this._pickProductAndQuantity().then(function (oResult) {
        if (!oResult) { return; }
        var oItemsBinding = this.byId("orderItemsTable").getBinding("items");
        var oNewItemContext = oItemsBinding.create({
          product_ID: oResult.productID,
          product: { ID: oResult.productID, name: oResult.productLabel, currency_code: oResult.productCurrency },
          quantity: oResult.quantity,
          unitPrice: oResult.productPrice,
          netAmount: oResult.productPrice != null ? oResult.productPrice * oResult.quantity : null
        });
        oNewItemContext.created()
          .then(this._refreshOrderTotal.bind(this))
          .catch(this._error.bind(this));
      }.bind(this));
    },

    onRemoveDraftItem: function (oEvent) {
      var oContext = oEvent.getSource().getBindingContext();
      oContext.delete()
        .then(this._refreshOrderTotal.bind(this))
        .catch(this._error.bind(this));
    },

    onQuantityChange: function (oEvent) {
      // Item pricing on a draft-scoped row is only finalized server-side when
      // the order is saved (draftActivate) - see the note in sales-service.js.
      // Recompute netAmount optimistically here so the row looks right while
      // still editing; requestSideEffects is a best-effort re-sync on top.
      var oContext = oEvent.getSource().getBindingContext();
      var fUnitPrice = oContext.getProperty("unitPrice");
      var iQuantity = oContext.getProperty("quantity");
      if (fUnitPrice != null && iQuantity != null) {
        oContext.setProperty("netAmount", fUnitPrice * iQuantity);
      }
      oContext.requestSideEffects(["unitPrice", "netAmount"])
        .then(this._refreshOrderTotal.bind(this))
        .catch(this._error.bind(this));
    },

    _refreshOrderTotal: function () {
      var oContext = this.byId("orderDetailPage").getBindingContext();
      if (oContext) {
        // Optimistic client-side total (server only finalizes it on Save).
        var aItemContexts = this.byId("orderItemsTable").getBinding("items").getCurrentContexts();
        var fTotal = aItemContexts.reduce(function (sum, c) {
          return sum + (Number(c.getProperty("netAmount")) || 0);
        }, 0);
        oContext.setProperty("totalAmount", fTotal);
        return oContext.requestSideEffects(["totalAmount"]).catch(function () {});
      }
      return Promise.resolve();
    },

    // ---------------------------------------------------------------
    // Bound actions / bound function on the active order
    // ---------------------------------------------------------------

    onConfirmOrder: function () {
      this._executeBoundAction("SalesService.confirm(...)");
    },

    onCancelOrder: function () {
      this._sCancelReason = "";
      this.loadFragment({ name: "salesorderui.fragment.CancelOrderDialog" }).then(function (oDialog) {
        this._oCancelDialog = oDialog;
        oDialog.open();
      }.bind(this));
    },

    onCancelReasonChange: function (oEvent) {
      this._sCancelReason = oEvent.getParameter("value");
    },

    onConfirmCancelOrder: function () {
      this._oCancelDialog.close();
      this._executeBoundAction("SalesService.cancel(...)", { reason: this._sCancelReason });
    },

    onCloseCancelDialog: function () {
      this._oCancelDialog.close();
    },

    onAddItemAction: function () {
      this._pickProductAndQuantity().then(function (oResult) {
        if (!oResult) { return; }
        this._executeBoundAction("SalesService.addItem(...)", {
          product: oResult.productID,
          quantity: oResult.quantity
        }).then(function () {
          this.byId("orderItemsTable").getBinding("items").refresh();
        }.bind(this));
      }.bind(this));
    },

    onGetSummary: function () {
      var oModel = this.getView().getModel();
      var oContext = this.byId("orderDetailPage").getBindingContext();
      var oOp = oModel.bindContext("SalesService.getSummary(...)", oContext);

      oOp.execute().then(function () {
        var oResult = oOp.getBoundContext().getObject();
        MessageBox.information(
          this._i18n("orderNo") + ": " + oResult.orderNo + "\n" +
          this._i18n("status") + ": " + oResult.status + "\n" +
          this._i18n("itemCount") + ": " + oResult.itemCount + "\n" +
          this._i18n("totalAmount") + ": " + oResult.totalAmount,
          { title: this._i18n("orderSummary") }
        );
      }.bind(this)).catch(this._error.bind(this));
    },

    onDeleteOrderDetail: function () {
      var oContext = this.byId("orderDetailPage").getBindingContext();
      MessageBox.confirm(this._i18n("confirmDeleteOrder"), {
        onClose: function (sAction) {
          if (sAction !== MessageBox.Action.OK) { return; }
          oContext.delete().then(function () {
            this.onNavBack();
            this.byId("ordersTable").getBinding("items").refresh();
          }.bind(this)).catch(this._error.bind(this));
        }.bind(this)
      });
    },

    _executeBoundAction: function (sAction, mParams) {
      var oModel = this.getView().getModel();
      var oContext = this.byId("orderDetailPage").getBindingContext();
      var oOp = oModel.bindContext(sAction, oContext);
      if (mParams) {
        Object.keys(mParams).forEach(function (k) { oOp.setParameter(k, mParams[k]); });
      }
      return oOp.execute().then(function () {
        MessageToast.show(this._i18n("orderSaved"));
        this.byId("ordersTable").getBinding("items").refresh();
      }.bind(this)).catch(this._error.bind(this));
    },

    // ---------------------------------------------------------------
    // Shared product/quantity picker dialog
    // ---------------------------------------------------------------

    _pickProductAndQuantity: function () {
      return this.loadFragment({ name: "salesorderui.fragment.ItemPickerDialog" }).then(function (oDialog) {
        this._oItemPickerDialog = oDialog;
        return new Promise(function (resolve) {
          this._fnItemPickerResolve = resolve;
          this._oItemPickerModel = new JSONModel({ productID: null, productLabel: "", quantity: 1 });
          oDialog.setModel(this._oItemPickerModel, "picker");
          oDialog.open();
        }.bind(this));
      }.bind(this));
    },

    onItemPickerProductChange: function (oEvent) {
      var oSelectedItem = oEvent.getParameter("selectedItem");
      var oCtx = oSelectedItem ? oSelectedItem.getBindingContext() : null;
      this._oItemPickerModel.setProperty("/productLabel", oCtx ? oCtx.getProperty("name") : "");
      this._oItemPickerModel.setProperty("/productPrice", oCtx ? oCtx.getProperty("price") : null);
      this._oItemPickerModel.setProperty("/productCurrency", oCtx ? oCtx.getProperty("currency_code") : null);
    },

    onItemPickerOk: function () {
      var oData = this._oItemPickerModel.getData();
      this._oItemPickerDialog.close();
      if (!oData.productID) {
        this._fnItemPickerResolve(null);
        return;
      }
      this._fnItemPickerResolve({
        productID: oData.productID,
        productLabel: oData.productLabel,
        productPrice: oData.productPrice,
        productCurrency: oData.productCurrency,
        quantity: oData.quantity || 1
      });
    },

    onItemPickerCancel: function () {
      this._oItemPickerDialog.close();
      this._fnItemPickerResolve(null);
    },

    // ---------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------

    _i18n: function (sKey) {
      return this._oBundle ? this._oBundle.getText(sKey) : sKey;
    },

    _error: function (e) {
      MessageBox.error((e && e.message) || String(e));
    }

  });
});
