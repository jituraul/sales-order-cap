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
    },

    fileSize: function (iBytes) {
      if (iBytes == null) { return ""; }
      var n = Number(iBytes);
      if (n < 1024) { return n + " B"; }
      if (n < 1024 * 1024) { return (n / 1024).toFixed(1) + " KB"; }
      return (n / (1024 * 1024)).toFixed(1) + " MB";
    }
  };
});
