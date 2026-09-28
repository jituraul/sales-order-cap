sap.ui.define([], function () {
  "use strict";

  return {
    statusState: function (sStatus) {
      switch (sStatus) {
        case "DRAFT": return "None";
        case "OPEN": return "Information";
        case "CONFIRMED": return "Success";
        case "SHIPPED": return "Warning";
        case "DELIVERED": return "Success";
        case "CANCELLED": return "Error";
        default: return "None";
      }
    },

    draftIconVisible: function (bHasDraftEntity) {
      return !!bHasDraftEntity;
    }
  };
});
