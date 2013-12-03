JLD_Transaction = (function () {
    return {
        FieldName:{
            PAYMENT_METHOD: 'custbody_so_payment_method',
            CUSTOMER_DEPOSIT_ID: 'custbody_so_deposit_id',
            BOB_SO_CREATED_DATE: 'custbody_so_bob_created_date',
            SO_NUMBER: 'custbody_so_number',
            SO_ITEM_ID : 'custbody_bob_id_je',
            TOTAL_LINES: 'custbody_so_order_lines',
            JE_REFUND_COUPON_CODE: 'custbody_je_refund_coupon_code',
            COUPON_CODE: 'custbody_so_coupon_code',
            JE_COUPON_CODE : 'custbody_je_coupon_code',
            DEPOSIT_AMOUNT: 'custbody_so_deposit_amt',
            REVENUE_RECOGNITION_CONSTANT : 'custbody_so_revenue_recognition_const', // for saving revenue recognition constant on SO
            TYPE_OF_FULFILLMENT : 'custbody_if_type',
            TYPE_OF_RECEIPT : 'custbody_ir_type',
            CONSIGNMENT_SALES_PO : 'custbody_consignment_sales_po',
            PO_CONTRACT_TYPE : 'custbody_po_contract_type',
            RETURN_INITIATED_BY : 'custbody_vr_return_initiated_by',
            WRITE_OFF_DATE: 'custbody_ir_write_off_date',
            PO_NUMBER : 'custbody_po_number',
            POI_REFENCE : 'custbody_oms_poi_ref'
            
        },
        ColumnName:{
            ALREADY_CANCELLED: 'custcol_soi_canceled_flag',
            CANCELLED_DATE: 'custcol_soi_canc_date',
            ALREADY_FULFILLED: 'custcol_soi_fulfilled_flag', // ALREADY_SHIPPED is changed to ALREADY_FULFILLED
            SHIP_DATE: 'custcol_soi_shipdate',
            ALREADY_RETURNED: 'custcol_soi_refunded_flag',
            REFUND_DATE: 'custcol_soi_refund_date',
            ALREADY_PREPAID : 'custcol_soi_prepaid_flag',
            PREPAID_DATE: 'custcol_soi_prepaid_date',
            ALREADY_DELIVERED: 'custcol_soi_delivered_flag',
            REAL_DELIVERY_DATE: 'custcol_soi_real_delivery_date', 
            DELIVERY_FAILED_ON: 'custcol_soi_delivery_failedon',
            BOB_ID: 'custcol_soi_bob_id',
            STORE_CREDIT: 'custcol_soi_storecredit',
            RETURNED_ON : 'custcol_soi_returnedon',
            RETURN_ITEM_STATUS : 'custcol_soi_ret_itemstatus',
            SHIPPING_CARRIER: 'custcol_soi_shipped_by',
            REFUND_METHOD: 'custcol_soi_refund_method',
            REFUND_SHIPPING_AMOUNT: 'custcol_soi_refund_shipping_am',
            REFUND_BANK_REFERENCE: 'custcol_soi_refund_bank_reference',
            PAID_PRICE : 'custcol_soi_paidprice',
            CONSIGNMENT_PRICE : 'custcol_soi_consignment_price',
            CONSIGNMENT_RETURN_BILL_REFERENCE : 'custcol_cons_return_bill_ref',
            CONSIGNMENT_SALE_BILL_REFERENCE : 'custcol_cons_sale_bill_ref',
            SO_ITEM_CONSIGNMENT_VENDOR : 'custcol_soi_consignment_vendor',
            CONTRACT_TYPE : 'custcol_soi_uid_contract_type',
            FULFILLEMENT_DATE : '', // this will be having the id of either shipping date(when revenue recognition constant is Shipped) or real delivery date(when revenue recognition constant is Delivered) at runtime
            RETURN_ACTION_DATE : 'custcol_soi_return_action_date',
            ALREADY_RETURNED_ACTIONED : 'custcol_soi_returned_action_flag',
            RETURN_ACTION : 'custcol_soi_return_action',
            OMS_POI_REF : 'custcol_soi_poi_ref',
            OMS_UID_COST : 'custcol_soi_oms_uidcost',
            OMS_UID : 'custcol_oms_uid'
            
            
            
        },
        Constant:{
            REVENUE_RECOGNITION_CONSTANT : 'Shipped' // we can have value of Delivered | Shipped
        },
        Location : {
            CUSTOMER_RETURNS_QC_FAILED : '49'
        },
        POContractType :{
            OUTRIGHT : '1',
            CONSIGNMENT : '2'
        }
    }
})();