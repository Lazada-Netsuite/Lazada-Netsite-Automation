LAZADA_CONSIGNMENT = (function () {
    return {
        FieldName:{
        	CONSIGNMENT_CONTRACT: 'custbody_auto_po',
        	CONSIGNMENT_SALES_PO: 'custbody_consignment_sales_po'
        	     },
        ColumnName:{
            CONSIGNMENT_VENDOR : 'custcol_soi_consignment_vendor',
            SALE_BILL_REF : 'custcol_cons_sale_bill_ref',
            RETURN_BILL_REF : 'custcol_cons_return_bill_ref',
            OMS_REFERENCE : 'custcol_poi_oms_ref',
            CONSIGNMENT_PRICE : 'custcol_soi_consignment_price',
            OMS_UID : 'custcol_oms_uid',
            POI_REF : 'custcol_soi_poi_ref',
            SO_BILL_REF	: 'custcol_soi_bill_ref' ,
            CONSIGNMENT_PO_REF: 'custcol_soi_cons_po_reference',
            CONSIGNMENT_RETURN_REF : 'custcol_soi_cons_return_reference',
            CONSIGNMENT_RETURN_DATE : 'custcol_vri_consignment_return_date',
            CONSIGNMENT_RETURN_IF_ID : 'custcol_vri_consignment_return_if_id',
            CONSIGNMENT_RECEIPT_DATE : 'custcol_poi_receipt_date',
            CONSIGNMENT_RECEIPT_IR_ID : 'custcol_poi_receipt_id',
            BOB_ID: 'custcol_soi_bob_id'
        },
        Constant:{
        	CONSIGNMENT_CONTRACT : 'Consignment',
        	VENDOR_BILL_PREFIX: 'VCB_',
        	VENDOR_CREDIT_PREFIX: 'VCC_',
        	VENDOR_BILL: 'vendorbill',
        	VENDOR_CREDIT: 'vendorcredit',
        	TRUE_FLAG : 'T',
        	FALSE_FLAG : 'F',
        	LAZADA_VENDOR : 12,
        	EXPENSE_ACCOUNT_ID : 58,
        	CONSIGNMENT_PURCHASE_ORDER : 'purchaseorder',
        	CONSIGNMENT_VENDOR_RETURN : 'vendorreturnauthorization', 
        	CONSIGNMENT_ITEM_RECEIPT : 'itemreceipt',
        	PURCHASE_PREFIX : 'CPO_',
        	RETURN_PREFIX : 'CVR_',
        	CONSIGNMENT_FULFILL : 'CONSIGNMENT_FULFILL',
        	WARE_HOUSE : 'WARE_HOUSE',
        	PENDING_RETURN : 'Pending Return',
        	PARTIALLY_RETURN : 'Partially Return',
        	CONSIGNMENT_ITEM_FULFILLMENT: 'itemfulfillment',
        	ZERO: 0,
        	PENDING_RECEIPT : 'Pending Receipt',
			PARTIALLY_RECEIVED : 'Partially Received',
			CONSIGNMENT_DELIVERY_RECEIPT : 'customsearch_consignment_item_receipt'
        },
        CustomRecord:{
        	PRO_VENDOR : 'custrecord_cons_pro_vendor',
        	PRO_ITEM : 'custrecord_cons_pro_item',
        	PRO_FR_DATE: 'custrecord_con_pro_from_date',
        	PRO_TO_DATE: 'custrecord_con_pro_to_date',
        	PRO_COST: 'custrecord_con_pro_cost',
        	PROMOTION_TABLE: 'customrecord_consignment_promotion',
        	CON_VENDOR : 'custrecord_consignment_vendor',
        	CON_ITEM : 'custrecord_consignment_item',
        	CON_FR_DATE: 'custrecord_consignment_from_date',
        	CON_COST: 'custrecord_consignment_cost',
        	PROMOTION_TABLE: 'customrecord_consignment_promotion',
        	INVENTORY_TABLE:  'customrecord_consignment_inventory' 				 
        },
        
       WithHoldingTax:{
    	   BOTH : 'both',
    	   ON_PURCHASE : 'onpurcs',
    	   ON_SALE : 'onsales'
    	},
        LID:{
				WARE_HOUSE:1,
				CONSIGNMENT_FULFILL:27,
		  },
		LMY:{
				WARE_HOUSE:28,
				CONSIGNMENT_FULFILL:30,
			 },
		 LVN:{
					WARE_HOUSE:45,
					CONSIGNMENT_FULFILL:48,
			 },
		  LPH:{
				   WARE_HOUSE:32,
					CONSIGNMENT_FULFILL:36,
			   },
		   LTH:{
					WARE_HOUSE:41,
					CONSIGNMENT_FULFILL:43,
			  },
		    LSG:{
					WARE_HOUSE:37,
					CONSIGNMENT_FULFILL:39,
				 }
    }
})();