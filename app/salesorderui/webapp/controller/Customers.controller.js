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

  return Controller.extend("salesorderui.controller.Customers", {

    onInit: function () {
      this.getView().setModel(new JSONModel({ selected: null }), "ui");
    },

    onSearchCustomers: function (oEvent) {
      var sQuery = oEvent.getParameter("query") || "";
      var aFilters = sQuery ? [new Filter("name", FilterOperator.Contains, sQuery)] : [];
      this.byId("customersTable").getBinding("items").filter(aFilters);
    },

    onCustomerSelectionChange: function (oEvent) {
      var oItem = oEvent.getParameter("listItem");
      this.getView().getModel("ui").setProperty("/selected", oItem ? oItem.getBindingContext() : null);
    },

    onCreateCustomer: function () {
      var oModel = this.getView().getModel();
      this._oNewBinding = oModel.bindList("/Customers", undefined, [], [], { $$updateGroupId: GROUP });
      var oContext = this._oNewBinding.create({
        name: "", email: "", phone: "", country: "", city: "", street: "", postalCode: ""
      });
      this._bNew = true;
      this._openDialog(oContext, false);
    },

    onEditCustomer: function () {
      var oContext = this.getView().getModel("ui").getProperty("/selected");
      if (!oContext) { return; }
      this._bNew = false;
      this._openDialog(oContext, true);
    },

    _openDialog: function (oContext, bDeferredEdit) {
      this.loadFragment({ name: "salesorderui.fragment.CustomerDialog" }).then(function (oDialog) {
        this._oDialog = oDialog;
        if (bDeferredEdit) {
          oDialog.bindElement({ path: oContext.getPath(), parameters: { $$updateGroupId: GROUP } });
          this._oEditContext = oContext;
        } else {
          oDialog.setBindingContext(oContext);
          this._oEditContext = oContext;
        }
        oDialog.open();
      }.bind(this));
    },

    onSaveCustomer: function () {
      var oModel = this.getView().getModel();
      var bNew = this._bNew;
      oModel.submitBatch(GROUP)
        .then(function () {
          return bNew ? this._oEditContext.created() : Promise.resolve();
        }.bind(this))
        .then(function () {
          MessageToast.show(bNew ? "Customer created" : "Customer saved");
          this._oDialog.close();
          this.byId("customersTable").getBinding("items").refresh();
        }.bind(this))
        .catch(function (e) { MessageBox.error((e && e.message) || String(e)); });
    },

    onCancelCustomerDialog: function () {
      this.getView().getModel().resetChanges(GROUP);
      this._oDialog.close();
    },

    onDeleteCustomer: function () {
      var oContext = this.getView().getModel("ui").getProperty("/selected");
      if (!oContext) { return; }
      MessageBox.confirm("Delete this customer?", {
        onClose: function (sAction) {
          if (sAction !== MessageBox.Action.OK) { return; }
          oContext.delete().then(function () {
            MessageToast.show("Customer deleted");
          }).catch(function (e) { MessageBox.error((e && e.message) || String(e)); });
        }
      });
    }
  });
});
