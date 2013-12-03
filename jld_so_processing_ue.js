/* Author : szaka
 * so = sales order
 * retAuth = return authorization
 * li = line item
 * custDep = customer deposit
 * sub = subsidiary
 * newSalesorderArray = [start]Array for storing values of sales order that needs to be submitted after processing all cases
 * During processing netsuite changes salesorder status that makes our salesorder object inconsistent.For handlin this we load SO at the end and submits all values from this 
 * array in new salesorder record [end]
 * Locking Mechanism [start] we have implemented locking mechanism on SO level since the restlet which is pushing the SO in netsuite is multi-threaded.
 * Therefore a case can arrise that one SO is being pushed on multiple threads at the same time which would result in incorrect accounting transactions [end]
 * */

var globalValues = new Object();
var newSalesorderArray = new Array();
var recordsToBeDeleted = new Array();
function soProcessingAS(type){
    var context = nlapiGetContext();
    // i.e when created through Restlet
    //if(context.getExecutionContext() == 'suitelet')
    //{
    
    var soInternalId = nlapiGetRecordId();
    if(isSOLocked(soInternalId)){
        nlapiLogExecution('DEBUG', 'SO is already locked');
        // SO is locked, so don't need to do anything
        return;
    }else{
        createLock(soInternalId);
    }
    
    if(type == 'create' || type == 'edit'){
        /* getting values in global object so that we don't need to access them repeatedly using netsuite <object>.getFieldValue() call. Therefore saving 
           script usage limits */
        globalValues.recType = nlapiGetRecordType();
        globalValues.recId = nlapiGetRecordId();
        globalValues.salesOrder = nlapiLoadRecord(globalValues.recType, globalValues.recId);
        globalValues.soTranid = globalValues.salesOrder.getFieldValue('tranid');
        globalValues.soRecId = globalValues.salesOrder.getId();
        globalValues.soEntity = globalValues.salesOrder.getFieldValue('entity');
        globalValues.soPaymentMethod = globalValues.salesOrder.getFieldValue(JLD_Transaction.FieldName.PAYMENT_METHOD);
        globalValues.soBobCreatedDate = globalValues.salesOrder.getFieldValue(JLD_Transaction.FieldName.BOB_SO_CREATED_DATE);
        globalValues.soSubsidiary = globalValues.salesOrder.getFieldValue('subsidiary');
        globalValues.soCurrency = globalValues.salesOrder.getFieldValue('currency');
        globalValues.soType = getSOType(globalValues.soPaymentMethod);
        globalValues.soShippingCost = globalValues.salesOrder.getFieldValue('shippingcost');
        globalValues.soShipMethod = globalValues.salesOrder.getFieldValue('shipmethod');
        globalValues.soShippingTaxRate = globalValues.salesOrder.getFieldValue('shippingtax1rate');
        // set FULFILLEMENT_DATE attribut according to revenue recognition constant()
        setFulfillmentDateAttribute(type);
        globalValues.revenueRecognitionConst = getRevenueRecognitionConst(type);
        
        
        
        nlapiLogExecution('DEBUG', 'so type = ', globalValues.soType);
        if(globalValues.soType == 'online'){
            processOnlineOrders();
        }
        else if(globalValues.soType == 'cod'){
            processCODOrders();
        }
        
        try{
            //nlapiSubmitRecord(globalValues.salesOrder, false, true);
            setRevenueRecognitionConstOnSO();
            submitSalesorder(globalValues.recId);
            nlapiLogExecution('DEBUG', 'submitted sales order');
            releaseLock();
        }catch(ex){
            if(ex instanceof nlobjError){
                nlapiLogExecution('ERROR', 'Error in submitting sales order' + ex.getCode() + ', ' + ex.getDetails());
            } else {
                nlapiLogExecution('ERROR', 'Error in submitting sales order', ex.toString());
            }
            releaseLock();
        }
    
    }
//}
}


/* returns the sales order type for the payment method used */
function getSOType(paymentMethod)
{ 
    var soType = '';
    if(!isBlankOrNull(paymentMethod)){
        try{
            var rec = nlapiLoadRecord(JLD_PaymentMethod.InternalID, paymentMethod);
            
            if(rec && rec != null){
                // fetching text so as not to use the internal id of order type list which is used to populate the Order Type field on Payment Method Record
                var orderType = rec.getFieldText(JLD_PaymentMethod.FieldName.ORDER_TYPE).toLowerCase();
                if(orderType.search('online') != -1)
                    soType =  'online';
                else if(orderType.search('cod') != -1)
                    soType =  'cod';
            
            }
        }catch(ex){
            nlapiLogExecution('DEBUG', 'payment method is invalid');
            soType = '';
        }
    
    
    }
    return soType;
}

/* complete flow for online orders is handled here
 * all the calculation is on line item level i.e processing each line item */

var customerDepositExists = false;
function processOnlineOrders()
{
    nlapiLogExecution('DEBUG', 'processing Online Orders');
    
    var liCount = globalValues.salesOrder.getLineItemCount('item');
    
    // checking if the customer deposit exits
    var custDepositId = globalValues.salesOrder.getFieldValue(JLD_Transaction.FieldName.CUSTOMER_DEPOSIT_ID);
    if(!isBlankOrNull(custDepositId)){
        customerDepositExists = true;
        globalValues.soCustomerDepositId = custDepositId;
    }
    // checking if any of the sales order line item is already shipped 
    //globalValues.anyLiAlreadyShipped = isAnyLiAlreadyShipped(); 
    
    for(var li = 1; li <= liCount; li++ ){
        recordsToBeDeleted = new Array();
        // only work for inventory item
        if(globalValues.salesOrder.getLineItemValue('item', 'itemtype', li) == 'InvtPart')
        {
            var alreadyPrepaid = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.ALREADY_PREPAID, li);
            var prepaidDate = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.PREPAID_DATE, li);
            var alreadyFulfilled = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.ALREADY_FULFILLED, li);
            var fulfillmentDate =  globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.FULFILLEMENT_DATE, li);
            var alreadyRefunded = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.ALREADY_RETURNED, li);
            var refundDate = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.REFUND_DATE, li);
            var alreadyCancelled = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.ALREADY_CANCELLED, li);
            var cancelledDate = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.CANCELLED_DATE, li);
            var alreadyReturnedActioned = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.ALREADY_RETURNED_ACTIONED, li);
            var returnActionDate = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.RETURN_ACTION_DATE, li);
            
            // i.e the li is not already processed for perpaid processing
            if(alreadyPrepaid == 'F'){
                if(!isBlankOrNull(prepaidDate)){
                    if(onlinePrepaidProcesing(li) == 'failed'){
                        continue;
                    }
                }
            }
            // i.e the li is not already processed for shipping processing
            if(alreadyFulfilled == 'F'){
                if(!isBlankOrNull(fulfillmentDate)){
                    if(onlineShippingProcessing(li) == "failed"){
                        continue;  
                    }
                }
            }
            // i.e the li is not already processed for refund processing
            if(alreadyRefunded == 'F'){
                if(!isBlankOrNull(refundDate)){
                    if(onlineRefundProcessing(li) == "failed"){
                        continue;
                    }
                }
            }
            // i.e the li is not already processed for cancel processing
            if(alreadyCancelled == 'F'){
                if(!isBlankOrNull(cancelledDate)){
                    if(onlineCancelProcessing(li,alreadyPrepaid) == "failed"){
                        continue;
                    }
                }
            }
            // i.e the li is not already processed for return action processing
            if(alreadyReturnedActioned == 'F'){
                if(!isBlankOrNull(returnActionDate)){
                    if(returnActionProcessing(li, alreadyRefunded, returnActionDate) == "failed"){
                        continue;
                    }
                }
            }
        
        }
    }


}

function processCODOrders(){
    nlapiLogExecution('DEBUG', 'processing COD Orders');
    
    var liCount = globalValues.salesOrder.getLineItemCount('item');
    
    // checking if the customer deposit exits
    if(!isBlankOrNull(globalValues.salesOrder.getFieldValue(JLD_Transaction.FieldName.CUSTOMER_DEPOSIT_ID))){
        customerDepositExists = true;
    }
    // checking if any of the sales order line item is already shipped 
    // globalValues.anyLiAlreadyShipped = isAnyLiAlreadyShipped(); 
    
    //checking if all line items fail delivery
    globalValues.allLineItemsDeliveryFailed = isAllLineItemsDeliveryFailed();
    
    for(var li = 1; li <= liCount; li++ ){
        recordsToBeDeleted = new Array();
        
        // only work for inventory item
        if(globalValues.salesOrder.getLineItemValue('item', 'itemtype', li) == 'InvtPart')
        {
            var alreadyPrepaid = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.ALREADY_PREPAID, li);
            var prepaidDate = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.PREPAID_DATE, li);
            var alreadyFulfilled = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.ALREADY_FULFILLED, li);
            var fulfillmentDate =  globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.FULFILLEMENT_DATE, li);
            var alreadyDelivered = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.ALREADY_DELIVERED, li);
            var deliveryDate = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.REAL_DELIVERY_DATE, li);
            var alreadyRefunded = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.ALREADY_RETURNED, li);
            var refundDate = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.REFUND_DATE, li);
            var alreadyCancelled = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.ALREADY_CANCELLED, li);
            var cancelledDate = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.CANCELLED_DATE, li);
            var alreadyReturnedActioned = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.ALREADY_RETURNED_ACTIONED, li);
            var returnActionDate = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.RETURN_ACTION_DATE, li);
            
            // i.e the li is not already processed for perpaid processing
            if(alreadyPrepaid == 'F'){
                if(!isBlankOrNull(prepaidDate)){
                //no action specified
                }
            }
            
            nlapiLogExecution('DEBUG', 'COD', 'Ship_date: ' + fulfillmentDate);
            // i.e the li is not already processed for shipping processing
            if(alreadyFulfilled == 'F'){
                if(!isBlankOrNull(fulfillmentDate)){
                    if(CODShippingProcessing(li) == "failed"){
                        continue;
                    }
                
                }
            }
            
            // i.e the li is not already processed for Real delivery processing
            if(alreadyDelivered == 'F'){
                if(!isBlankOrNull(deliveryDate)){
                    if (CODDeliveryProcessing(li) == 'failed'){
                        continue;
                    }
                }
            }
            
            // i.e the li is not already processed for refund processing
            if(alreadyRefunded == 'F'){
                if(!isBlankOrNull(refundDate)){
                    if (CODRefundProcessing(li) == 'failed'){
                        continue;
                    }
                }
            }
            // i.e the li is not already processed for cancel processing
            if(alreadyCancelled == 'F'){
                if(!isBlankOrNull(cancelledDate)){
                    CODCancelProcessing(li);
                }
            }
        
            // i.e the li is not already processed for return action processing
            if(alreadyReturnedActioned == 'F'){
                if(!isBlankOrNull(returnActionDate)){
                    if(returnActionProcessing(li, alreadyRefunded, returnActionDate) == "failed"){
                        continue;
                    }
                }
            }
        
        
        }
    }

}

function onlinePrepaidProcesing(li){
    nlapiLogExecution('DEBUG', 'doing online prepaid processing');
    
    if(customerDepositExists == true){
        var obj = new Object();
        obj.type = "li";//li for line item field
        obj.internalid = JLD_Transaction.ColumnName.ALREADY_PREPAID;
        obj.lineNumber = li;
        obj.value = 'T';
        obj.sublist = "item";
        newSalesorderArray.push(obj);
    //globalValues.salesOrder.setLineItemValue('item', JLD_Transaction.ColumnName.ALREADY_PREPAID, li, 'T');
    }
    else{
        var depositAmount = globalValues.salesOrder.getFieldValue(JLD_Transaction.FieldName.DEPOSIT_AMOUNT);
        if(depositAmount > 0){
            var custDepResponse = createCustomerDeposit(depositAmount);
            
            if(custDepResponse.status == "passed"){
                var obj = new Object();
                obj.type = "li";//li for line item field
                obj.internalid = JLD_Transaction.ColumnName.ALREADY_PREPAID;
                obj.lineNumber = li;
                obj.value = 'T';
                obj.sublist = "item";
                newSalesorderArray.push(obj);
            // globalValues.salesOrder.setLineItemValue('item', JLD_Transaction.ColumnName.ALREADY_PREPAID, li, 'T');
            }else{
                // i.e the respone is failed
                return custDepResponse.status;
            }
        
        }else{
            var obj = new Object();
            obj.type = "li";//li for line item field
            obj.internalid = JLD_Transaction.ColumnName.ALREADY_PREPAID;
            obj.lineNumber = li;
            obj.value = 'T';
            obj.sublist = "item";
            newSalesorderArray.push(obj);
        }
    }
    
    return "passed";
}

function createCustomerDeposit(grandTotal){
    nlapiLogExecution('DEBUG', 'creating customer deposit');
    
    var custDep = nlapiCreateRecord('customerdeposit');
    var sobobdate = globalValues.salesOrder.getFieldValue(JLD_Transaction.FieldName.BOB_SO_CREATED_DATE);
    var responseObj = new Object();
    
    if(!isBlankOrNull(sobobdate))
    {
        custDep.setFieldValue('trandate', getDate(sobobdate));
    }
    
    custDep.setFieldValue('customer', globalValues.soEntity);
    custDep.setFieldValue(JLD_Transaction.FieldName.SO_NUMBER, globalValues.soTranid);
    custDep.setFieldValue('payment', grandTotal);
    custDep.setFieldValue(JLD_Transaction.FieldName.PAYMENT_METHOD, globalValues.soPaymentMethod);
    
    var tranId = globalValues.soTranid;
    // getting so number from slicing tran id
    var sonumber = getNumber(tranId);
    
    custDep.setFieldValue('tranid', getSubPrefix(globalValues.soTranid) + '_CD_' + sonumber);
    custDep.setFieldValue('externalid', getSubPrefix(globalValues.soTranid) + '_CD_' + sonumber);                
    // by szaka: getting bank account details
    var bankAccId = getBankAccId(globalValues.soPaymentMethod);
    nlapiLogExecution('DEBUG', 'bank acc id = ', bankAccId);
    
    if(!isBlankOrNull(bankAccId))
    {
        custDep.setFieldValue('undepfunds', 'F');
        custDep.setFieldValue('account', bankAccId);
    }
    
    try{
        responseObj.depId = nlapiSubmitRecord(custDep, false, true);
        responseObj.status = 'passed';
        nlapiLogExecution('DEBUG', 'customer deposit rec id =', responseObj.depId);
        customerDepositExists = true;
        globalValues.soCustomerDepositId = responseObj.depId;
        
        var obj = new Object();
        obj.type = 'customerdeposit';
        obj.internalId = responseObj.depId;
        recordsToBeDeleted.push(obj);
        
        
        var obj1 = new Object();
        obj1.type = "bo";//bo for body field
        obj1.internalid = JLD_Transaction.FieldName.CUSTOMER_DEPOSIT_ID;
        obj1.value = responseObj.depId;
        newSalesorderArray.push(obj1);
    //globalValues.salesOrder.setFieldValue(JLD_Transaction.FieldName.CUSTOMER_DEPOSIT_ID, depId);
    
    
    }catch(ex){
        if ( ex instanceof nlobjError )
            nlapiLogExecution( 'ERROR', 'error in creating customer deposit', ex.getCode() + '\n' + ex.getDetails() );
        else
            nlapiLogExecution( 'ERROR', 'error in creating customer deposit', ex.toString() );
        responseObj.status = 'failed';
        releaseLock();
    }
    
    
    
    return responseObj;

}

function getSubPrefix(tranId){
    var prefix = tranId.substr(0, tranId.indexOf('_'));
    return prefix;
}

// by szaka: getting bank accout id
function getBankAccId(paymentMethod)
{
    var bankAccId = null;
    
    if(!isBlankOrNull(paymentMethod)){
        try{
            //var getBankAcc = nlapiLoadRecord(JLD_PaymentMethod.InternalID, paymentMethod);
            //bankAccId  = getBankAcc.getFieldValue(JLD_PaymentMethod.FieldName.BANK_ACCOUNT_INTERNAL_ID);
            var recs = nlapiSearchRecord(JLD_PaymentMethod.InternalID, null, new nlobjSearchFilter('name', null, 'is', paymentMethod) , 
                new nlobjSearchColumn(JLD_PaymentMethod.FieldName.BANK_ACCOUNT_INTERNAL_ID));
            if(recs && recs.length > 0)
                bankAccId = recs[0].getValue(JLD_PaymentMethod.FieldName.BANK_ACCOUNT_INTERNAL_ID);
        
        }catch(ex){
            nlapiLogExecution('DEBUG', 'Bank Acc Not Found', 'bank account was not found against the payment method');
        }
    
    }
    return bankAccId;
}

function onlineShippingProcessing(li)
{
    /* *******************************************************************************************************/
    var createIFResponse = createItemFullfillment(li);
    if(createIFResponse.status == "failed"){
        deleteCreatedRecords();
        return createIFResponse.status;
    }
    /* *******************************************************************************************************/
    
    /* *******************************************************************************************************/
    var createInvResponse = createInvoice(li);
    if(createInvResponse.status == "failed"){
        deleteCreatedRecords();
        return createInvResponse.status;
    }
    /* *******************************************************************************************************/
    
    /* *******************************************************************************************************/
    var storeCredit = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.STORE_CREDIT, li);
    var storeCreditUtilJEId = null;
    if(!isBlankOrNull(storeCredit) && storeCredit > 0){
        
        var createSCUtilJEResponse = createStoreCreditUtilJE(li, storeCredit);
        if(createSCUtilJEResponse.status == "failed"){
            deleteCreatedRecords();
            return createSCUtilJEResponse.status;
        }
        else{
            storeCreditUtilJEId = createSCUtilJEResponse.jeId;
        }
    }
    /* *******************************************************************************************************/
    
    /* *******************************************************************************************************/
    var createCPResponse = createCustPaymentNApplyDepositToInv(createInvResponse.invId, li, storeCreditUtilJEId);
    if(createCPResponse.status == "failed"){
        deleteCreatedRecords();
        return createCPResponse.status;
    }
    /* *******************************************************************************************************/
    
    // setting already shipped flag
    var obj = new Object();
    obj.type = "li";//li for line item field
    obj.internalid = JLD_Transaction.ColumnName.ALREADY_FULFILLED;
    obj.lineNumber = li;
    obj.value = 'T';
    obj.sublist = "item";
    newSalesorderArray.push(obj);
    
    // calling Kalyan & Zubair function
    processVendorTransaction(li, LAZADA_CONSIGNMENT.Constant.VENDOR_BILL);
    
    //globalValues.salesOrder.setLineItemValue('item', JLD_Transaction.ColumnName.ALREADY_FULFILLED, li, 'T');
    // return passed status
    return "passed";
}

function createItemFullfillment(li)
{
    var responseObj = new Object();
    
    nlapiLogExecution('DEBUG', 'creating item fullfillment');
    var itemFullfill = nlapiTransformRecord('salesorder', globalValues.soRecId, 'itemfulfillment');
    nlapiLogExecution('DEBUG', 'debug: transformed to imtemfullfillment');
    var ifLiCount = itemFullfill.getLineItemCount('item');
    nlapiLogExecution('debug', 'ifcnt', ifLiCount);
    
    itemFullfill.setFieldValue('trandate', getDate(globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.FULFILLEMENT_DATE , li)) );
    itemFullfill.setFieldValue(JLD_Transaction.FieldName.SO_NUMBER, globalValues.soTranid);
    var bobId = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.BOB_ID, li);
    itemFullfill.setFieldValue(JLD_Transaction.FieldName.SO_ITEM_ID, bobId);
    // getting bob number by slicing bob id
    var bobNumber = getNumber(bobId);
    
    itemFullfill.setFieldValue('tranid', getSubPrefix(globalValues.soTranid) + '_IF_' + bobNumber);
    itemFullfill.setFieldValue('externalid', getSubPrefix(globalValues.soTranid) + '_IF_' + bobNumber);
    itemFullfill.setFieldValue(JLD_Transaction.FieldName.TYPE_OF_FULFILLMENT, JLD_String.For.SALES_TYPE_OF_FULFILLMENT);
    
    itemFullfill.setFieldValue('shipstatus','C');
    
    for(var ifLiIndex = 1; ifLiIndex <= ifLiCount; ifLiIndex++)
    {
        var ifLiBobId = itemFullfill.getLineItemValue('item', JLD_Transaction.ColumnName.BOB_ID, ifLiIndex);
        nlapiLogExecution('debug', 'ifcnt', ifLiBobId + ': ' + bobId);
        if(ifLiBobId != bobId)
        {
            itemFullfill.setLineItemValue('item', 'itemreceive', ifLiIndex, 'F');
        }
        else
        {
            //nlapiLogExecution('debug', 'location', globalValues.salesOrder.getFieldValue('location'));
            //itemFullfill.setLineItemValue('item', 'quantity', ifLiIndex, globalValues.salesOrder.getLineItemValue('item', 'quantity', li));
            itemFullfill.setLineItemValue('item', 'location', ifLiIndex, globalValues.salesOrder.getFieldValue('location'));
        }
    }
    
    //itemFullfill.setFieldValue(JLD_Transaction.FieldName.ITEMS_PRICE, globalValues.salesOrder.getLineItemValue('item', 'amount', li));
    
    try
    {
        var ifId = nlapiSubmitRecord(itemFullfill, true, true);
        nlapiLogExecution('DEBUG', 'item fullfillment rec id =', ifId);
        responseObj.status = "passed";
        responseObj.ifId = ifId;
        
        var obj = new Object();
        obj.type = 'itemfulfillment';
        obj.internalId = ifId;
        recordsToBeDeleted.push(obj);
    
    }catch(ex){
        if ( ex instanceof nlobjError )
            nlapiLogExecution( 'ERROR', 'error in creating item fullfillment', ex.getCode() + '\n' + ex.getDetails() );
        else
            nlapiLogExecution( 'ERROR', 'error in creating item fullfillment', ex.toString() );
        responseObj.status = "failed";
        releaseLock();
    }
    
    return responseObj;
}

function createInvoice(li)
{
    var responseObj = new Object();
    
    nlapiLogExecution('DEBUG', 'creating invoice');
    
    var invoice = nlapiTransformRecord('salesorder', globalValues.soRecId, 'invoice');
    invoice.setFieldValue('trandate', getDate(globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.FULFILLEMENT_DATE , li)));
    invoice.setFieldValue(JLD_Transaction.FieldName.SO_NUMBER, globalValues.soTranid);
    var bobId = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.BOB_ID, li);
    invoice.setFieldValue(JLD_Transaction.FieldName.SO_ITEM_ID, bobId);
    
    var invLiCount = invoice.getLineItemCount('item');
    
    for(var invLiIndex = 1; invLiIndex <= invLiCount; invLiIndex++)
    {
        var invBobId = invoice.getLineItemValue('item', JLD_Transaction.ColumnName.BOB_ID, invLiIndex);
        
        if(invBobId != bobId)
        {
            invoice.removeLineItem('item', invLiIndex);
            invLiIndex--;
            invLiCount--;
        }
        else
        {
            invoice.setLineItemValue('item', 'tax1amt', invLiIndex, globalValues.salesOrder.getLineItemValue('item', 'tax1amt', li));
        }
    }
    
    // if this is the first item being shipped then include shipping fee
    //    if(globalValues.anyLiAlreadyShipped == false){
    //        // just set these two fields and the rest will be taken careof by netsuite
    //        // by setting these two fields we are adding shipping fee
    //        invoice.setFieldValue('shippingcost', globalValues.soShippingCost);
    //        invoice.setFieldValue('shipmethod', globalValues.soShipMethod);
    //        globalValues.anyLiAlreadyShipped = true;
    //    }
    
    var bobNumber = getNumber(bobId);
    
    invoice.setFieldValue('tranid', getSubPrefix(globalValues.soTranid)+ '_INV_' + '_' + bobNumber);
    invoice.setFieldValue('externalid', getSubPrefix(globalValues.soTranid)+ '_INV_' + '_' + bobNumber);
    try
    {
        var invId = nlapiSubmitRecord(invoice, true, true);
        nlapiLogExecution('DEBUG', 'invoice rec id =', invId);
        responseObj.invId = invId;
        responseObj.status = "passed";
        
        var obj = new Object();
        obj.type = 'invoice';
        obj.internalId = invId;
        recordsToBeDeleted.push(obj);
    
    }catch(ex){
        if ( ex instanceof nlobjError )
            nlapiLogExecution( 'ERROR', 'error in creating invoice', ex.getCode() + '\n' + ex.getDetails() );
        else
            nlapiLogExecution( 'ERROR', 'error in creating invoice', ex.toString() );
        
        responseObj.status = "failed";
        releaseLock();
    }
    
    return responseObj;
}

function isAnyLiAlreadyShipped()
{
    var liCount = globalValues.salesOrder.getLineItemCount('item');
    var anyLiShipped = false;
    
    for(var i = 1; i <= liCount; i++){
        if(globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.ALREADY_FULFILLED, i) == 'T'){
            anyLiShipped = true;
            break;
        }
    }
    return anyLiShipped;
}

function createStoreCreditUtilJE(li, storeCredit)
{
    var responseObj = new Object();
    
    nlapiLogExecution('DEBUG', 'creating store credit util je');
    var journalEntry = nlapiCreateRecord('journalentry');
    
    if(!isBlankOrNull(globalValues.bobSOCreatedDate))
    {
        journalEntry.setFieldValue('trandate', getDate(globalValues.soBobCreatedDate));
    }
    journalEntry.setFieldValue('subsidiary', globalValues.soSubsidiary);
    journalEntry.setFieldValue('currency', globalValues.soCurrency);
    journalEntry.setFieldValue(JLD_Transaction.FieldName.SO_NUMBER, globalValues.soTranid);
    var bobId = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.BOB_ID, li);
    journalEntry.setFieldValue(JLD_Transaction.FieldName.SO_ITEM_ID, bobId );
    journalEntry.setFieldValue(JLD_Transaction.FieldName.JE_COUPON_CODE, globalValues.salesOrder.getFieldValue(JLD_Transaction.FieldName.COUPON_CODE) );
    
    var bobNumber = getNumber(bobId);
    
    journalEntry.setFieldValue('tranid', getSubPrefix(globalValues.soTranid) + '_JSU_' + bobNumber);
    journalEntry.setFieldValue('externalid', getSubPrefix(globalValues.soTranid) + '_JSU_' + bobNumber);
    // debiting an account                                        
    journalEntry.setLineItemValue('line', 'account', 1, JLD_Accounts.Account.ACCURED_OUTSTANDING_VOUCHERS);
    journalEntry.setLineItemValue('line', 'debit', 1, storeCredit);
    journalEntry.setLineItemValue('line', 'entity', 1, globalValues.soEntity);
    // crediting an account
    journalEntry.setLineItemValue('line', 'account', 2, JLD_Accounts.Account.ACCOUNTS_RECEIVABLE);
    journalEntry.setLineItemValue('line', 'credit', 2, storeCredit);
    journalEntry.setLineItemValue('line', 'entity', 2, globalValues.soEntity);
    
    try{
        var jeId = nlapiSubmitRecord(journalEntry, false, true);
        nlapiLogExecution('DEBUG', 'store credit util je id =', jeId);
        
        responseObj.status = "passed";
        responseObj.jeId = jeId;
        
        var obj = new Object();
        obj.type = 'journalentry';
        obj.internalId = jeId;
        recordsToBeDeleted.push(obj);
    
    }catch(ex){
        if ( ex instanceof nlobjError )
            nlapiLogExecution( 'ERROR', 'error in creating store credit util je', ex.getCode() + '\n' + ex.getDetails() );
        else
            nlapiLogExecution( 'ERROR', 'error in creating store credit util je', ex.toString() );
        
        responseObj.status = "failed";
        releaseLock();
    }
    
    return responseObj;
}

function createCustPaymentNApplyDepositToInv(invId, li, storeCreditUtilJEId)
{
    var responseObj = new Object();
    
    nlapiLogExecution('DEBUG', 'creating customer payment');
    var custpayment = nlapiTransformRecord('invoice', invId, 'customerpayment');
    var fulfillmentDate = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.FULFILLEMENT_DATE, li);
    
    if(!isBlankOrNull(fulfillmentDate))
    {
        custpayment.setFieldValue('trandate', getDate(fulfillmentDate));
    }
    custpayment.setFieldValue('undepfunds','T');
    custpayment.setFieldValue(JLD_Transaction.FieldName.SO_NUMBER, globalValues.soTranid);
    var bobId = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.BOB_ID, li);
    custpayment.setFieldValue(JLD_Transaction.FieldName.SO_ITEM_ID, bobId);
    
    custpayment.setFieldValue('tranid', getSubPrefix(globalValues.soTranid) + '_CP_' + getNumber(bobId));
    custpayment.setFieldValue('externalid', getSubPrefix(globalValues.soTranid) + '_CP_' + getNumber(bobId));
    
    var depLiCount = custpayment.getLineItemCount('deposit');
    var creLiCount = custpayment.getLineItemCount('credit');
    // apply sublist is invoices 
    var applyLiCount = custpayment.getLineItemCount('apply'); 
    
    if(customerDepositExists == true){
        if(depLiCount > 0){
            for(var k = 1; k <= depLiCount; k++)
            {
                var doc = custpayment.getLineItemValue('deposit', 'doc', k);
                if(doc == globalValues.soCustomerDepositId)
                {
                    custpayment.setLineItemValue('deposit', 'apply', k, 'T');
                    nlapiLogExecution('DEBUG', 'Debug: applied deposit');
                }
            }
        }
    
    }
    
    if(!isBlankOrNull(storeCreditUtilJEId)){
        if(creLiCount > 0){
            for(var k2 = 1; k2 <= creLiCount; k2++)
            {
                var doc = custpayment.getLineItemValue('credit', 'doc', k2);
                if(doc == storeCreditUtilJEId)
                {
                    custpayment.setLineItemValue('credit', 'apply', k2, 'T');
                    nlapiLogExecution('DEBUG', 'Debug: applied credit');
                }
            }
        }   
    }
    
    if(applyLiCount > 0){
        for(var k1 = 1; k1 <= applyLiCount; k1++)
        {
            var doc1 = custpayment.getLineItemValue('apply', 'doc', k1);
            if(doc1 == invId)
            {
                custpayment.setLineItemValue('apply', 'apply', k1, 'T');
                nlapiLogExecution('DEBUG', 'Debug: applied applied');
            }
        }    
    }
    
    try
    {
        var custPaymentId = nlapiSubmitRecord(custpayment, true, true);
        nlapiLogExecution('DEBUG', 'customer payment rec id=', custPaymentId);
        responseObj.status = "passed";
        responseObj.custPaymentId = custPaymentId;
        
        var obj = new Object();
        obj.type = 'customerpayment';
        obj.internalId = custPaymentId;
        recordsToBeDeleted.push(obj);
    
    }catch(ex){
        if ( ex instanceof nlobjError )
            nlapiLogExecution( 'ERROR', 'error in creating customer payment', ex.getCode() + '\n' + ex.getDetails() );
        else
            nlapiLogExecution( 'ERROR', 'error in creating customper payment', ex.toString() );
        
        responseObj.status = "failed";
        releaseLock();
    }
    
    return responseObj;
}

function CODShippingProcessing(li)
{
    nlapiLogExecution('DEBUG', 'COD', 'Shipping Processing');
    /****************************************************************************************/
    var responseOne = createItemFullfillment(li);
    if(responseOne.status == "failed"){
        return responseOne.status;
    }
    /****************************************************************************************/
    
    /****************************************************************************************/
    var responseTwo = createInvoice(li);
    if(responseTwo.status == "failed"){
        deleteCreatedRecords();
        return responseTwo.status;
    }
    /****************************************************************************************/
    
    /****************************************************************************************/
    var storeCredit = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.STORE_CREDIT, li);
    if(!isBlankOrNull(storeCredit) && storeCredit > 0){
        var responseThree = createStoreCreditUtilJE(li, storeCredit);
        if(responseThree.status == "failed"){
            deleteCreatedRecords();
            return responseThree.status;
        }
    }
    /****************************************************************************************/
    
    // setting already shipped flag
    var obj = new Object();
    obj.type = "li";//B for body field
    obj.internalid = JLD_Transaction.ColumnName.ALREADY_FULFILLED;
    obj.lineNumber = li;
    obj.value = 'T';
    obj.sublist = "item";
    newSalesorderArray.push(obj);
    
    // calling Kalyan & Zubair functions
    processVendorTransaction(li, LAZADA_CONSIGNMENT.Constant.VENDOR_BILL);
    
    // globalValues.salesOrder.setLineItemValue('item', JLD_Transaction.ColumnName.ALREADY_FULFILLED, li, 'T');
    // return passed status
    return "passed";

}

function CODCancelProcessing(li){
    var obj = new Object();
    obj.type = "li";//B for body field
    obj.internalid = 'isclosed';
    obj.lineNumber = li;
    obj.value = 'T';
    obj.sublist = "item";
    newSalesorderArray.push(obj);
    //globalValues.salesOrder.setLineItemValue('item', 'isclosed', li, 'T');
    var obj = new Object();
    obj.type = "li";//B for body field
    obj.internalid = JLD_Transaction.ColumnName.ALREADY_CANCELLED;
    obj.lineNumber = li;
    obj.value = 'T';
    obj.sublist = "item";
    newSalesorderArray.push(obj);
//globalValues.salesOrder.setLineItemValue('item', JLD_Transaction.ColumnName.ALREADY_CANCELLED, li, 'T');
}

function CODDeliveryProcessing(li){
    
    nlapiLogExecution('DEBUG', 'COD', 'Delivery Processing');
    var bobId = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.BOB_ID, li);
    var shippedBy = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.SHIPPING_CARRIER, li);
    var invoice_id = getInviceID(bobId);
    var bankAccount = null;
    var custPymntRetObj = new Object();
    if(!isBlankOrNull(shippedBy)){
        //assuming shippedBy is linked with the custom record "Logistics Provider". shippedBy is internalID of "Logistics Provider" record.
        bankAccount = getBankAccountFromLogisticsProvider(shippedBy);
    }
    
    if(!isBlankOrNull(invoice_id)){
        custPymntRetObj =  createCustPymntApply(invoice_id,bankAccount,li);
    }
    if(custPymntRetObj.status == 'passed'){
        var obj = new Object();
        obj.type = "li";//B for body field
        obj.internalid = JLD_Transaction.ColumnName.ALREADY_DELIVERED;
        obj.lineNumber = li;
        obj.value = 'T';
        obj.sublist = "item";
        newSalesorderArray.push(obj);
    //globalValues.salesOrder.setLineItemValue('item', JLD_Transaction.ColumnName.ALREADY_DELIVERED, li, 'T');
    }
    nlapiLogExecution('DEBUG', 'COD', 'CstPymnt' + custPymntRetObj.custPymntId);
    return custPymntRetObj.status;
}

function getInviceID(bobId){
    var invoiceRecs = nlapiSearchRecord('invoice',null,new nlobjSearchFilter(JLD_Transaction.FieldName.SO_ITEM_ID,null,'is',bobId));
    if(invoiceRecs && invoiceRecs.length > 0){
        return invoiceRecs[0].getId();
    }
    return null;
}

function getBankAccountFromLogisticsProvider(shippedBy){
    var logisticRec = nlapiLoadRecord(JLD_Logistics_Provider.InternalId,shippedBy);
    
    return logisticRec.getFieldValue(JLD_Logistics_Provider.FieldName.BANK_ACCOUNT_ID); 

}

function createCustPymntApply(invoice_id,bankAccount,li){
    
    nlapiLogExecution('DEBUG', 'creating customer payment');
    var cstmrPayment = nlapiTransformRecord('invoice', invoice_id, 'customerpayment');
    var fulfillmentDate = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.FULFILLEMENT_DATE, li);
    var custPymtRetObj = new Object();
    
    if(!isBlankOrNull(fulfillmentDate))
    {
        cstmrPayment.setFieldValue('trandate', getDate(fulfillmentDate));
    }
    // this is necessary to do before you set the bank account
    cstmrPayment.setFieldValue('undepfunds','F');
    cstmrPayment.setFieldValue('account', bankAccount);
    
    cstmrPayment.setFieldValue(JLD_Transaction.FieldName.SO_NUMBER, globalValues.soTranid);
    var bobId = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.BOB_ID, li);
    cstmrPayment.setFieldValue(JLD_Transaction.FieldName.SO_ITEM_ID, bobId);
    
    cstmrPayment.setFieldValue('tranid', getSubPrefix(globalValues.soTranid) + '_CP_' + getNumber(bobId));
    cstmrPayment.setFieldValue('externalid', getSubPrefix(globalValues.soTranid) + '_CP_' + getNumber(bobId));
    
    var applyLiCount = cstmrPayment.getLineItemCount('apply'); 
    
    if(applyLiCount > 0){
        for(var k1 = 1; k1 <= applyLiCount; k1++)
        {
            var doc2 = cstmrPayment.getLineItemValue('apply','doc',k1);
            if(doc2 == invoice_id)
            {
                cstmrPayment.setLineItemValue('apply','apply',k1,'T');
            }
        }    
    }
    
    try{
        custPymtRetObj.custPymntId = nlapiSubmitRecord(cstmrPayment, false, true);
        nlapiLogExecution('DEBUG', 'customer payment id =', custPymtRetObj.custPymntId);
        custPymtRetObj.status = 'passed';
        
        var obj = new Object();
        obj.type = 'customerpayment';
        obj.internalId = custPymtRetObj.custPymntId;
        recordsToBeDeleted.push(obj);
    
    }catch(exp){
        if(exp instanceof nlobjError){
            nlapiLogExecution('ERROR', 'Error in creating customer payment' + exp.getCode() + ', ' + exp.getDetails());
        } else {
            nlapiLogExecution('ERROR', 'Error in creating customer payment', exp.toString());
        }
        custPymtRetObj.status = 'failed';
    }
    return custPymtRetObj;
}

//if '_' found then returns number from id after last "_" else returns whole id
function getNumber(strId){
    if(!isBlankOrNull(strId)){
        if(strId.indexOf('_') != -1)
            return strId.substr(strId.lastIndexOf('_') + 1,strId.length - 1);
        else
            return strId;
    }
}

function deleteCreatedRecords(){
    
    try{
        var cnt = recordsToBeDeleted.length;
        for(var ind = 0; ind < cnt; ind ++){
            nlapiLogExecution('DEBUG', 'record to be deleted : id', ind + ":"+ recordsToBeDeleted[ind]);
            nlapiDeleteRecord(recordsToBeDeleted[ind].type, recordsToBeDeleted[ind].internalId);
        }   
    }catch(ex){
        if(ex instanceof nlobjError){
            nlapiLogExecution('ERROR', 'Error in deleting record' + ex.getCode() + ', ' + ex.getDetails());
        } else {
            nlapiLogExecution('ERROR', 'Error in deleteing record', ex.toString());
        }
        releaseLock();
    }

}

function isBlankOrNull(str) {
    if (typeof(str) == 'undefined' || str == 'undefined' || str == null || str == '' || str == 'null' || str == '- None -') {
        return true;
    }
    else {
        return false;
    }
}

function onlineRefundProcessing(li){
    
    /*******************************************************************************************/
    var createRetAuthResponse = createReturnAuthorization(li);
    if(createRetAuthResponse.status == "failed"){
        return createRetAuthResponse.status;
    }
    /*******************************************************************************************/
    
    /*******************************************************************************************/
    
    /*******************************************************************************************/
    // checking <Return Item Status> condition is covered in <createItemReceipt> function 
    var createItemRecptResponse = createItemReceipt(li, createRetAuthResponse.retAuthId);
    if(createItemRecptResponse.status == "failed"){
        deleteCreatedRecords();
        return createItemRecptResponse.status;
    }
    /*******************************************************************************************/
    
    /*******************************************************************************************/
    if(globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.REFUND_METHOD, li) == 'NoPayment'){
        var storeCredit = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.STORE_CREDIT, li);
        if(!isBlankOrNull(storeCredit) && storeCredit > 0 ){
            var createGenSCUtilJEResponse = createStoreCreditGenJE(li, storeCredit);
            if(createGenSCUtilJEResponse.status == "failed"){
                deleteCreatedRecords();
                return createGenSCUtilJEResponse.status;
            }
            
            var createCMResponse = createCreditMemo(li, createRetAuthResponse.retAuthId ,createGenSCUtilJEResponse.jeId);
            if(createCMResponse.status == "failed"){
                deleteCreatedRecords();
                return createCMResponse.status;
            }
        }
    }
    else{
        var createCMResponse = createCreditMemo(li, createRetAuthResponse.retAuthId , null);
        if(createCMResponse.status == "failed"){
            deleteCreatedRecords();
            return createCMResponse.status;
        }
        
        var createCRResponse = createCustomerRefund(li, 'creditmemo', createCMResponse.creditMemoId, 'refund');
        if(createCRResponse.status == "failed"){
            deleteCreatedRecords();
            return createCRResponse.status;
        }
    }
    
    /*******************************************************************************************/
    
    // setting already refunded flag
    var obj = new Object();
    obj.type = "li";//B for body field
    obj.internalid = JLD_Transaction.ColumnName.ALREADY_RETURNED;
    obj.lineNumber = li;
    obj.value = 'T';
    obj.sublist = "item";
    newSalesorderArray.push(obj);
    
    // calling Kalyan & Zubair function
    processVendorTransaction(li, LAZADA_CONSIGNMENT.Constant.VENDOR_CREDIT);
    
    //globalValues.salesOrder.setLineItemValue('item', JLD_Transaction.ColumnName.ALREADY_RETURNED, li, 'T');
    // return passed status
    return "passed";
}

function createReturnAuthorization(li){
    
    nlapiLogExecution('DEBUG', 'creating return authorization');
    var responseObj = new Object();
    var retAuth = nlapiTransformRecord('salesorder', globalValues.soRecId, 'returnauthorization');
    nlapiLogExecution('DEBUG', 'debug: transformed to returnauthorization');
    var returnOnDate = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.RETURNED_ON, li); 
    var failedOnDeliveryDate = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.DELIVERY_FAILED_ON, li); 
    var bobId = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.BOB_ID, li);
    if(!isBlankOrNull(returnOnDate))
    {
        retAuth.setFieldValue('trandate', getDate(returnOnDate));
    }
    else if(!isBlankOrNull(failedOnDeliveryDate)){
        
        retAuth.setFieldValue('trandate', getDate(failedOnDeliveryDate));
    }
    
    retAuth.setFieldValue(JLD_Transaction.FieldName.SO_NUMBER, globalValues.soTranid);
    retAuth.setFieldValue(JLD_Transaction.FieldName.SO_ITEM_ID, bobId);
    retAuth.setFieldValue('orderstatus','B');
    retAuth.setFieldValue('tranid', getSubPrefix(globalValues.soTranid) + '_RA_' + getNumber(bobId));
    retAuth.setFieldValue('externalid', getSubPrefix(globalValues.soTranid) + '_RA_' + getNumber(bobId));
    var retAuthLiCount = retAuth.getLineItemCount('item');
    // by szaka : remove all the line items from return authorization which have different bob id as that of sales order line item bob id
    if(retAuthLiCount > 0)
    {
        for(var fd = 1; fd <= retAuthLiCount; fd++)
        {
            var liItemType = retAuth.getLineItemValue('item', 'itemtype', fd);
            var liBobId = retAuth.getLineItemValue('item', JLD_Transaction.ColumnName.BOB_ID, fd);
            
            if(liItemType == 'InvtPart' && liBobId == bobId){
            // keep this item
            }
            else{
                retAuth.removeLineItem('item',fd);
                fd--;
                retAuthLiCount--;
            }
        }   
    }
    try{
        var retAuthId = nlapiSubmitRecord(retAuth, false, true);
        responseObj.status = "passed";
        responseObj.retAuthId = retAuthId;
        
        var obj = new Object();
        obj.type = 'returnauthorization';
        obj.internalId = retAuthId;
        recordsToBeDeleted.push(obj);
        
        nlapiLogExecution('DEBUG', 'return authorization id =', retAuthId);
    }catch(ex){
        if(ex instanceof nlobjError){
            nlapiLogExecution('ERROR', 'Error in creating return authorization' + ex.getCode() + ', ' + ex.getDetails());
        } else {
            nlapiLogExecution('ERROR', 'Error in creating return authorization', ex.toString());
        }
        responseObj.status = "failed"; 
        releaseLock();
    }     
    
    return responseObj;
}

function createItemReceipt(li, retAuthId){
    var responseObj = new Object();
    var itemRecpt = nlapiTransformRecord('returnauthorization', retAuthId, 'itemreceipt');
    var returnedOnDate = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.RETURNED_ON, li);
    if(!isBlankOrNull(returnedOnDate))
    {
        itemRecpt.setFieldValue('trandate', getDate(returnedOnDate));
    }
    var bobId = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.BOB_ID, li);
    itemRecpt.setFieldValue(JLD_Transaction.FieldName.SO_NUMBER, globalValues.soTranid);
    itemRecpt.setFieldValue(JLD_Transaction.FieldName.SO_ITEM_ID, bobId);
    itemRecpt.setFieldValue('tranid', getSubPrefix(globalValues.soTranid) + '_IR_' + getNumber(bobId));
    itemRecpt.setFieldValue('externalid', getSubPrefix(globalValues.soTranid) + '_IR_' + getNumber(bobId));
    itemRecpt.setFieldValue(JLD_Transaction.FieldName.TYPE_OF_RECEIPT, JLD_String.For.TYPE_OF_RECEIPT);
    
    // since there will be only one line item on item receipt according to our flow
    itemRecpt.setLineItemValue('item', 'restock', 1, 'T');
    
    var returnItemStatus = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.RETURN_ITEM_STATUS, li);
    if(returnItemStatus == 'returned_qcfailed'){
        // since there will be only one line item on item receipt according to our flow
        itemRecpt.setLineItemValue('item', 'location', 1, JLD_Transaction.Location.CUSTOMER_RETURNS_QC_FAILED);
    }
    else{
        if(globalValues.soType == 'online'){
        // will be provided by lazada
        // Vendortrans("fullfill");
        }else{
        // will be provided by lazada
        // Vendortrans("Return");
        }
    }
    
    try{
        var itemRecptId = nlapiSubmitRecord(itemRecpt, true, true);
        nlapiLogExecution('DEBUG', 'item receipt id=', itemRecptId);
        responseObj.status = "passed";
        responseObj.itemRecptId = itemRecptId;
        
        var obj = new Object();
        obj.type = 'itemreceipt';
        obj.internalId = itemRecptId;
        recordsToBeDeleted.push(obj);
    
    }catch(ex){
        if(ex instanceof nlobjError){
            nlapiLogExecution('ERROR', 'Error in creating item receipt' + ex.getCode() + ', ' + ex.getDetails());
        } else {
            nlapiLogExecution('ERROR', 'Error in creating item receipt', ex.toString());
        }
        responseObj.status = "failed";
        releaseLock();
    }
    
    return responseObj;
}

function createRevStoreCreditUtilJE(li, storeCredit){
    var responseObj = new Object();
    
    nlapiLogExecution('DEBUG', 'creating reverse store credit util je');
    var journalEntry = nlapiCreateRecord('journalentry');
    var refundDate = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.REFUND_DATE, li);
    if(!isBlankOrNull(refundDate))
    {
        journalEntry.setFieldValue('trandate', getDate(refundDate));
    }
    journalEntry.setFieldValue('subsidiary', globalValues.soSubsidiary);
    journalEntry.setFieldValue('currency', globalValues.soCurrency);
    journalEntry.setFieldValue(JLD_Transaction.FieldName.SO_NUMBER, globalValues.soTranid);
    var bobId = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.BOB_ID, li);
    journalEntry.setFieldValue(JLD_Transaction.FieldName.SO_ITEM_ID, bobId );
    journalEntry.setFieldValue(JLD_Transaction.FieldName.JE_COUPON_CODE, globalValues.salesOrder.getFieldValue(JLD_Transaction.FieldName.COUPON_CODE) );
    
    var bobNumber = getNumber(bobId);
    
    journalEntry.setFieldValue('tranid', getSubPrefix(globalValues.soTranid) + '_JSR_' + bobNumber);
    journalEntry.setFieldValue('externalid', getSubPrefix(globalValues.soTranid) + '_JSR_' + bobNumber);
    // crediting an account                                        
    journalEntry.setLineItemValue('line', 'account', 1, JLD_Accounts.Account.ACCURED_OUTSTANDING_VOUCHERS);
    journalEntry.setLineItemValue('line', 'credit', 1, storeCredit);
    journalEntry.setLineItemValue('line', 'entity', 1, globalValues.soEntity);
    // debiting an account
    journalEntry.setLineItemValue('line', 'account', 2, JLD_Accounts.Account.ACCOUNTS_RECEIVABLE);
    journalEntry.setLineItemValue('line', 'debit', 2, storeCredit);
    journalEntry.setLineItemValue('line', 'entity', 2, globalValues.soEntity);
    
    try{
        var jeId = nlapiSubmitRecord(journalEntry, false, true);
        nlapiLogExecution('DEBUG', 'reverse store credit util je id =', jeId);
        
        responseObj.status = "passed";
        responseObj.jeId = jeId;
        
        var obj = new Object();
        obj.type = 'journalentry';
        obj.internalId = jeId;
        recordsToBeDeleted.push(obj);
    
    }catch(ex){
        if ( ex instanceof nlobjError )
            nlapiLogExecution( 'ERROR', 'error in creating store credit util je', ex.getCode() + '\n' + ex.getDetails() );
        else
            nlapiLogExecution( 'ERROR', 'error in creating store credit util je', ex.toString() );
        
        responseObj.status = "failed";
        releaseLock();
    }
    
    return responseObj;
}

function createStoreCreditGenJE(li, storeCredit){
    var responseObj = new Object();
    
    nlapiLogExecution('DEBUG', 'creating generation je');
    var journalEntry = nlapiCreateRecord('journalentry');
    var refundDate = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.REFUND_DATE, li);
    if(!isBlankOrNull(refundDate))
    {
        journalEntry.setFieldValue('trandate', getDate(refundDate));
    }
    journalEntry.setFieldValue('subsidiary', globalValues.soSubsidiary);
    journalEntry.setFieldValue('currency', globalValues.soCurrency);
    journalEntry.setFieldValue(JLD_Transaction.FieldName.SO_NUMBER, globalValues.soTranid);
    var bobId = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.BOB_ID, li);
    journalEntry.setFieldValue(JLD_Transaction.FieldName.SO_ITEM_ID, bobId );
    
    journalEntry.setFieldValue(JLD_Transaction.FieldName.JE_REFUND_COUPON_CODE, globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.REFUND_BANK_REFERENCE, li) );
    
    var bobNumber = getNumber(bobId);
    
    journalEntry.setFieldValue('tranid', getSubPrefix(globalValues.soTranid) + '_JSG_' + bobNumber);
    journalEntry.setFieldValue('externalid', getSubPrefix(globalValues.soTranid) + '_JSG_' + bobNumber);
    // crediting an account                                        
    journalEntry.setLineItemValue('line', 'account', 1, JLD_Accounts.Account.ACCURED_OUTSTANDING_VOUCHERS);
    journalEntry.setLineItemValue('line', 'credit', 1, storeCredit);
    journalEntry.setLineItemValue('line', 'entity', 1, globalValues.soEntity);
    // debiting an account
    journalEntry.setLineItemValue('line', 'account', 2, JLD_Accounts.Account.ACCOUNTS_RECEIVABLE);
    journalEntry.setLineItemValue('line', 'debit', 2, storeCredit);
    journalEntry.setLineItemValue('line', 'entity', 2, globalValues.soEntity);
    
    try{
        var jeId = nlapiSubmitRecord(journalEntry, false, true);
        nlapiLogExecution('DEBUG', 'generation je id =', jeId);
        
        responseObj.status = "passed";
        responseObj.jeId = jeId;
        
        var obj = new Object();
        obj.type = 'journalentry';
        obj.internalId = jeId;
        recordsToBeDeleted.push(obj);
    }catch(ex){
        if ( ex instanceof nlobjError )
            nlapiLogExecution( 'ERROR', 'error in creating generation je', ex.getCode() + '\n' + ex.getDetails() );
        else
            nlapiLogExecution( 'ERROR', 'error in creating geneartion je', ex.toString() );
        
        responseObj.status = "failed";
        releaseLock();
    }
    
    return responseObj;
}
function createCreditMemo(li, retAuthId, jeId, invId){
    
    nlapiLogExecution('DEBUG', 'creating credit memo');
    var responseObj = new Object();
    var creditMemo = nlapiTransformRecord('returnauthorization', retAuthId, 'creditmemo');
    var refundDate = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.REFUND_DATE, li);
    if(!isBlankOrNull(refundDate))
    {
        creditMemo.setFieldValue('trandate', getDate(refundDate));
    }
    
    creditMemo.setFieldValue(JLD_Transaction.FieldName.SO_NUMBER, globalValues.soTranid);
    var bobId = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.BOB_ID, li);
    creditMemo.setFieldValue(JLD_Transaction.FieldName.SO_ITEM_ID, bobId);
    
    creditMemo.setFieldValue('tranid', getSubPrefix(globalValues.soTranid) + '_CM_' + getNumber(bobId));
    creditMemo.setFieldValue('externalid', getSubPrefix(globalValues.soTranid) + '_CM_' + getNumber(bobId));
    
    nlapiLogExecution('DEBUG', 'debug: jeId', jeId);
    if(!isBlankOrNull(jeId)){
        var applyLiCount = creditMemo.getLineItemCount('apply');
        nlapiLogExecution('DEBUG', 'applyli Count', applyLiCount);
        
        if(applyLiCount > 0)
        {
            for(var j = 1; j <= applyLiCount; j++)
            {
                var doc = creditMemo.getLineItemValue('apply', 'doc', j);
                //nlapiLogExecution('DEBUG', 'debug: doc =', doc);
                if(doc == jeId){
                    creditMemo.setLineItemValue('apply', 'apply', j, 'T');
                    nlapiLogExecution('DEBUG', 'debug: applied doc');
                }
            
            }
        }   
    }
    
    if(!isBlankOrNull(invId)){
        var applyLiCount = creditMemo.getLineItemCount('apply');
        if(applyLiCount > 0)
        {
            for(var j = 1; j <= applyLiCount; j++)
            {
                var doc = creditMemo.getLineItemValue('apply', 'doc', j);
                if(doc == invId)
                    creditMemo.setLineItemValue('apply', 'apply', j, 'T');
            }
        }   
    }
    
    if(globalValues.soType == 'cod'){
        // when delivery is failed we check for all line items fail condition else for real delivery date we check for refund shipping amount flag
        if(!isBlankOrNull(globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.DELIVERY_FAILED_ON, li))){
            // adding shipping fee to only one item if all items delivery failed [for COD only]
            if(globalValues.allLineItemsDeliveryFailed === true){
                // just set these two fields and the rest will be taken careof by netsuite
                // by setting these two fields we are adding shipping fee
                creditMemo.setFieldValue('shippingcost', globalValues.soShippingCost);
                creditMemo.setFieldValue('shipmethod', globalValues.soShipMethod);
                globalValues.allLineItemsDeliveryFailed = false;
            }
        }
        else if(!isBlankOrNull(globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.REAL_DELIVERY_DATE, li))){
            if(globalValues.soType == 'cod' && globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.REFUND_SHIPPING_AMOUNT, li) == 'T'){
                
                creditMemo.setFieldValue('shippingcost', globalValues.soShippingCost);
                creditMemo.setFieldValue('shipmethod', globalValues.soShipMethod);
            }
        }    
    }
    
    try{
        var creditMemoId = nlapiSubmitRecord(creditMemo , true, true);
        nlapiLogExecution('DEBUG', 'credit memo rec id=', creditMemoId);
        responseObj.status = "passed";
        responseObj.creditMemoId = creditMemoId;
        
        var obj = new Object();
        obj.type = 'creditmemo';
        obj.internalId = creditMemoId;
        recordsToBeDeleted.push(obj);
    
    }catch(ex){
        if ( ex instanceof nlobjError )
            nlapiLogExecution( 'ERROR', 'error in creating credit memo', ex.getCode() + '\n' + ex.getDetails() );
        else
            nlapiLogExecution( 'ERROR', 'error in creating credit memo', ex.toString() );
        
        responseObj.status = "failed";
        releaseLock();
    }
    
    return responseObj;
}

function isAllLineItemsDeliveryFailed(){
    var liCount = globalValues.salesOrder.getLineItemCount('item');
    var invCount = 0;
    var allItemsFailed = true;
    
    for(var i = 1; i <= liCount; i++){
        if(globalValues.salesOrder.getLineItemValue('item', 'itemtype', i) == 'InvtPart' ){
            invCount++;
            if(isBlankOrNull(globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.DELIVERY_FAILED_ON, i))){
                allItemsFailed = false;
                break;
            }
        }
    
    }
    if(invCount == globalValues.salesOrder.getFieldValue(JLD_Transaction.FieldName.TOTAL_LINES))
        return allItemsFailed;
    else 
        return null;
}
/* customer refund can be only be submitted if any line of credit sublist or deposit sublist is selected
 * in our case if state = refund, credit memo is applied on credit sublist
 * if state = cancelled, customer deposit is applied on deposit sublist
 * */
function createCustomerRefund(li, transformFrom, recId, state, step){
    
    nlapiLogExecution('DEBUG', 'creating customer refund');
    var responseObj = new Object();
    var submitCustRefund = false;
    //var custRefund = nlapiTransformRecord(transformFrom, recId, 'customerrefund');
    // var transformRec = nlapiLoadRecord(transformFrom, recId);
    
    // setting customer as an initial value is necessary to get all the fields and sublits(deposit and credit) sourced for a customer
    var initializeValues = new Array();
    initializeValues['entity'] = globalValues.soEntity;
    var custRefund = nlapiCreateRecord('customerrefund', initializeValues);
    
    // there isn't any field for this on customer refund
    //custRefund.setFieldValue(JLD_Transaction.FieldName.PAYMENT_METHOD, globalValues.soPaymentMethod);
    
    custRefund.setFieldValue(JLD_Transaction.FieldName.SO_NUMBER, globalValues.soTranid);
    var bobId = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.BOB_ID, li);
    custRefund.setFieldValue(JLD_Transaction.FieldName.SO_ITEM_ID, bobId);
    
    
    
    if(!isBlankOrNull(state)){
        if(state == "cancelled"){
            nlapiLogExecution('DEBUG', 'debug: in cancelled state');
            custRefund.setFieldValue('tranid', getSubPrefix(globalValues.soTranid) + '_CR_CAN_' + getNumber(bobId));
            custRefund.setFieldValue('externalid', getSubPrefix(globalValues.soTranid) + '_CR_CAN_' + getNumber(bobId));
            
            if(step == '5.1.1'){
                // setting Store Credit Bank id
                custRefund.setFieldValue('account', JLD_Accounts.Account.STORE_CREDIT);
            }else{
                custRefund.setFieldValue('account', getBankAccId(globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.REFUND_METHOD, li))); 
            }
            
            var cancelDate = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.CANCEL_DATE, li);
            if(!isBlankOrNull(cancelDate))
            {
                custRefund.setFieldValue('trandate', getDate(cancelDate));
            }
            var depLiCount = custRefund.getLineItemCount('deposit');
            nlapiLogExecution('DEBUG', 'debug: deposit line item count', depLiCount);
            if(depLiCount > 0){
                nlapiLogExecution('DEBUG', 'customer deposit id =', globalValues.soCustomerDepositId);
                for(var depLiIndex = 1; depLiIndex<= depLiCount; depLiIndex++){
                    var doc = custRefund.getLineItemValue('deposit', 'doc', depLiIndex);
                    if(doc == globalValues.soCustomerDepositId){
                        custRefund.setLineItemValue('deposit', 'apply', depLiIndex, 'T');
                        submitCustRefund = true;
                        var paidPrice = parseFloatNum(globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.PAID_PRICE, li));
                        if(globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.REFUND_SHIPPING_AMOUNT, li) == 'T'){
                            var shipCost = parseFloatNum(globalValues.soShippingCost); 
                            var shipTaxCost = parseFloatNum((globalValues.soShippingCost * globalValues.soShippingTaxRate));
                            custRefund.setLineItemValue('deposit', 'amount', depLiIndex, paidPrice + shipCost + shipTaxCost);
                        }else{
                            custRefund.setLineItemValue('deposit', 'amount', depLiIndex, paidPrice);
                        }
                    }
                
                }
            } 
        
        }
        else if(state == 'refund'){
            nlapiLogExecution('DEBUG', 'debug: refund state');
            nlapiLogExecution('DEBUG', 'debug: credit memoid =', recId);
            custRefund.setFieldValue('tranid', getSubPrefix(globalValues.soTranid) + '_CR_REF_' + getNumber(bobId));
            custRefund.setFieldValue('externalid', getSubPrefix(globalValues.soTranid) + '_CR_REF_' + getNumber(bobId));
            //custRefund.setFieldValue('account', getBankAccId(globalValues.soPaymentMethod));
            custRefund.setFieldValue('account', getBankAccId(globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.REFUND_METHOD, li)));
            var refundDate = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.REFUND_DATE, li);
            if(!isBlankOrNull(refundDate))
            {
                custRefund.setFieldValue('trandate', getDate(refundDate));
            }   
            var creLiCount = custRefund.getLineItemCount('apply');
            nlapiLogExecution('DEBUG', 'debug: credit Count', creLiCount);
            if(creLiCount > 0){
                for(var index=1; index<= creLiCount; index++){
                    var doc = custRefund.getLineItemValue('apply', 'doc', index);
                    if(doc == recId){
                        custRefund.setLineItemValue('apply', 'apply', index, 'T');
                        submitCustRefund = true;
                        nlapiLogExecution('DEBUG', 'debug: applied doc');
                    }
                }
            }
        }    
    }
    
    
    try{
        if(submitCustRefund == true){
            var custRefundId = nlapiSubmitRecord(custRefund, true, true);
            nlapiLogExecution('DEBUG', 'customer refund rec id=', custRefundId);
            responseObj.custRefundId = custRefundId;
            
            var obj = new Object();
            obj.type = 'customerrefund';
            obj.internalId = custRefundId;
            recordsToBeDeleted.push(obj);
        }
        
        responseObj.status = "passed";
    
    }catch(ex){
        if ( ex instanceof nlobjError )
            nlapiLogExecution( 'ERROR', 'error in creating customer refund', ex.getCode() + '\n' + ex.getDetails() );
        else
            nlapiLogExecution( 'ERROR', 'error in creating customer refund', ex.toString() );
        
        responseObj.status = "failed";
        releaseLock();
    }
    
    return responseObj;
}

function CODRefundProcessing(li){
    /*******************************************************************************************/
    // 3.1 - a) Create Return Authorization
    var createRetAuthResponse = createReturnAuthorization(li);
    if(createRetAuthResponse.status == "failed"){
        return createRetAuthResponse.status;
    }
    /*******************************************************************************************/
    
    // checking <Return Item Status> condition is covered in <createItemReceipt> function 
    // 3.2 - b) Create Item Reciept if RA is created sucessfully
    var createItemRecptResponse = createItemReceipt(li, createRetAuthResponse.retAuthId);
    if(createItemRecptResponse.status == "failed"){
        deleteCreatedRecords();
        return createItemRecptResponse.status;
    }
    /*******************************************************************************************/
    
    /*******************************************************************************************/
    nlapiLogExecution('DEBUG', 'Delivery Failed', globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.DELIVERY_FAILED_ON, li));
    if(!isBlankOrNull(globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.DELIVERY_FAILED_ON, li) && 
        globalValues.revenueRecognitionConst == 'Shipped')){
        
        nlapiLogExecution('DEBUG', 'Processing Delivery Failed');
        
        var BobId = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.BOB_ID, li);
        
        var createCMResponse1 = createCreditMemo(li, createRetAuthResponse.retAuthId , null, getInviceID(BobId));
        if(createCMResponse1.status == "failed"){
            deleteCreatedRecords();
            return createCMResponse1.status;
        }
        
        var storeCredit = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.STORE_CREDIT, li);
        if(!isBlankOrNull(storeCredit) && storeCredit > 0){
            
            var createRevSCUtilJEResponse = createRevStoreCreditUtilJE(li, storeCredit);
            
            if(createRevSCUtilJEResponse.status == 'failed'){
                deleteCreatedRecords();
                return createRevSCUtilJEResponse.status;
            }
        }
    
    }
    
    
    /*******************************************************************************************/
    
    /*******************************************************************************************/
    
    //3.1.4 check Real Delivery date and start refund-no payment component 3.1.4.1
    else if(!isBlankOrNull(globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.REAL_DELIVERY_DATE, li))){
        //Create Credit Memo from RA and create store credit generation JE 
        if(globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.REFUND_METHOD, li) == 'NoPayment'){
            var storeCredit = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.STORE_CREDIT, li);
            if(!isBlankOrNull(storeCredit) && storeCredit > 0 ){
                var createGenSCUtilJEResponse = createStoreCreditGenJE(li, storeCredit);
                if(createGenSCUtilJEResponse.status == "failed"){
                    deleteCreatedRecords();
                    return createGenSCUtilJEResponse.status;
                }
                
                var createCMResponse = createCreditMemo(li, createRetAuthResponse.retAuthId ,createGenSCUtilJEResponse.jeId);
                if(createCMResponse.status == "failed"){
                    deleteCreatedRecords();
                    return createCMResponse.status;
                }
            }
        }
        else{
            // create Credit Memo from RA and Customer Refund from Credit Memo
            var createCMResponse = createCreditMemo(li, createRetAuthResponse.retAuthId , null);
            if(createCMResponse.status == "failed"){     
                deleteCreatedRecords();
                return createCMResponse.status;
            }
            
            var createCRResponse = createCustomerRefund(li, 'creditmemo', createCMResponse.creditMemoId, 'refund');
            if(createCRResponse.status == "failed"){
                deleteCreatedRecords();
                return createCRResponse.status;
            }
        }
    }
    /*******************************************************************************************/
    
    /*******************************************************************************************/
    
    // setting already refunded flag
    var obj = new Object();
    obj.type = "li";//B for body field
    obj.internalid = JLD_Transaction.ColumnName.ALREADY_RETURNED;
    obj.lineNumber = li;
    obj.value = 'T';
    obj.sublist = "item";
    newSalesorderArray.push(obj);
    
    // calling Kalyan & Zubair function
    processVendorTransaction(li, LAZADA_CONSIGNMENT.Constant.VENDOR_CREDIT);
    
    // globalValues.salesOrder.setLineItemValue('item', JLD_Transaction.ColumnName.ALREADY_RETURNED, li, 'T');
    // return passed status
    return "passed";

}

// marker
function onlineCancelProcessing(li, alreadyPrepaid){
    
    nlapiLogExecution('DEBUG', 'doing online cancel processing');
    if(getAlreadyPrepaidStatus(alreadyPrepaid,li) == true){
        if(globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.REFUND_METHOD, li) == 'NoPayment'){
            /********************************************************************************************/
            var createCustRefundResponse = createCustomerRefund(li, 'customerdeposit', globalValues.soCustomerDepositId, 'cancelled', '5.1.1');
            if(createCustRefundResponse.status == "failed"){
                return createCustRefundResponse.status;
            }
            /********************************************************************************************/
            /********************************************************************************************/
            var createSCBankJEResponse = createStoreCreditBankJE(li);
            if(createSCBankJEResponse.status == "failed"){
                deleteCreatedRecords();
                return createSCBankJEResponse.status;
            }
        /********************************************************************************************/
        }
        else{
            /********************************************************************************************/
            var createCustRefundResponse = createCustomerRefund(li, 'customerdeposit', globalValues.soCustomerDepositId, 'cancelled', '5.1.2');
            if(createCustRefundResponse.status == "failed"){
                return createCustRefundResponse.status;
            }
        /********************************************************************************************/
        }
    }
    else{
        var obj = new Object();
        obj.type = "li";//B for body field
        obj.internalid = 'isclosed';
        obj.lineNumber = li;
        obj.value = 'T';
        obj.sublist = "item";
        newSalesorderArray.push(obj);
    //globalValues.salesOrder.setLineItemValue('isclosed', li, 'T');
    }
    // setting already cancelled flag
    
    var obj = new Object();
    obj.type = "li";//B for body field
    obj.internalid = JLD_Transaction.ColumnName.ALREADY_CANCELLED;
    obj.lineNumber = li;
    obj.value = 'T';
    obj.sublist = "item";
    newSalesorderArray.push(obj);
    //globalValues.salesOrder.setLineItemValue('item', JLD_Transaction.ColumnName.ALREADY_CANCELLED, li, 'T');
    //passing passed status
    return "passed";
}

function getAlreadyPrepaidStatus(loadedPrepaidVal,li){
    if(loadedPrepaidVal == 'T')
        return true;
    else{
        var cnt = newSalesorderArray.length;
        for(var i =0 ; i < cnt; i++ ){
            if(newSalesorderArray[i].type == "li" && newSalesorderArray[i].lineNumber == li && newSalesorderArray[i].internalid == JLD_Transaction.ColumnName.ALREADY_PREPAID){
                if(newSalesorderArray[i].value == 'T'){
                    return true;
                }
            }
        }
        return false;
    }

}


function createStoreCreditBankJE(li){
    var responseObj = new Object();
    
    nlapiLogExecution('DEBUG', 'creating store credit bank je');
    var journalEntry = nlapiCreateRecord('journalentry');
    var cancelledDate = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.CANCELLED_DATE, li);
    if(!isBlankOrNull(cancelledDate))
    {
        journalEntry.setFieldValue('trandate', getDate(cancelledDate));
    }
    journalEntry.setFieldValue('subsidiary', globalValues.soSubsidiary);
    journalEntry.setFieldValue('currency', globalValues.soCurrency);
    journalEntry.setFieldValue(JLD_Transaction.FieldName.SO_NUMBER, globalValues.soTranid);
    var bobId = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.BOB_ID, li);
    journalEntry.setFieldValue(JLD_Transaction.FieldName.SO_ITEM_ID, bobId );
    
    var bobNumber = getNumber(bobId);
    
    journalEntry.setFieldValue('tranid', getSubPrefix(globalValues.soTranid) + '_JSC_' + bobNumber);
    journalEntry.setFieldValue('externalid', getSubPrefix(globalValues.soTranid) + '_JSC_' + bobNumber);
    // debiting an account                                        
    journalEntry.setLineItemValue('line', 'account', 1, JLD_Accounts.Account.STORE_CREDIT);
    journalEntry.setLineItemValue('line', 'debit', 1, globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.PAID_PRICE, li));
    journalEntry.setLineItemValue('line', 'entity', 1, globalValues.soEntity);
    // crediting an account
    journalEntry.setLineItemValue('line', 'account', 2, JLD_Accounts.Account.ACCURED_OUTSTANDING_VOUCHERS);
    journalEntry.setLineItemValue('line', 'credit', 2, globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.PAID_PRICE, li));
    journalEntry.setLineItemValue('line', 'entity', 2, globalValues.soEntity);
    
    try{
        var jeId = nlapiSubmitRecord(journalEntry, false, true);
        nlapiLogExecution('DEBUG', 'store credit bank je id =', jeId);
        
        responseObj.status = "passed";
        responseObj.jeId = jeId;
        
        var obj = new Object();
        obj.type = 'journalentry';
        obj.internalId = jeId;
        recordsToBeDeleted.push(obj);
    }catch(ex){
        if ( ex instanceof nlobjError )
            nlapiLogExecution( 'ERROR', 'error in creating store credit bank je', ex.getCode() + '\n' + ex.getDetails() );
        else
            nlapiLogExecution( 'ERROR', 'error in creating store credit bank je', ex.toString() );
        
        responseObj.status = "failed";
        releaseLock();
    }
    
    return responseObj;
}

function getDate(dateTime){
    if(!isBlankOrNull(dateTime)){
        var date = dateTime.split(' ');
        return date[0];
    }
    else
        return dateTime;
}

function submitSalesorder(SOId){
    var SO = nlapiLoadRecord('salesorder', SOId);
    var cnt = newSalesorderArray.length;
    if(cnt > 0){
        for(var i = 0 ; i < cnt; i++){
            if(newSalesorderArray[i].type == 'bo'){
                SO.setFieldValue(newSalesorderArray[i].internalid, newSalesorderArray[i].value);
            }
            else if(newSalesorderArray[i].type == 'li'){
                SO.setLineItemValue(newSalesorderArray[i].sublist, newSalesorderArray[i].internalid, newSalesorderArray[i].lineNumber, newSalesorderArray[i].value);
            }
        }
        nlapiSubmitRecord(SO, false, true);
    }

}

function parseFloatNum(num){
    var number = parseFloat(num,10);
    if(isNaN(number))
    {
        number = 0;
    }
    return number;

}

/* setting fulfilled date atrribute in dao according to revenue recognition principle */
function setFulfillmentDateAttribute(type){
    if(type == 'create'){
        settingFulfillmentDateHelper(JLD_Transaction.Constant.REVENUE_RECOGNITION_CONSTANT); 
    }
    else
    {
        var revenueRecognitionConst = globalValues.salesOrder.getFieldValue(JLD_Transaction.FieldName.REVENUE_RECOGNITION_CONSTANT);
        if(!isBlankOrNull(revenueRecognitionConst))
        {
            settingFulfillmentDateHelper(revenueRecognitionConst);
        }
        else
        {
            settingFulfillmentDateHelper(JLD_Transaction.Constant.REVENUE_RECOGNITION_CONSTANT); 
        }
    
    }
}

function settingFulfillmentDateHelper(revenueRecognitionConst)
{
    if(revenueRecognitionConst == 'Shipped'){
        JLD_Transaction.ColumnName.FULFILLEMENT_DATE = JLD_Transaction.ColumnName.SHIP_DATE;
    }
    else if(JLD_Transaction.Constant.REVENUE_RECOGNITION_CONSTANT == 'Delivered'){
        JLD_Transaction.ColumnName.FULFILLEMENT_DATE = JLD_Transaction.ColumnName.REAL_DELIVERY_DATE;
    }
    else{
        JLD_Transaction.ColumnName.FULFILLEMENT_DATE = JLD_Transaction.ColumnName.SHIP_DATE;
    }
}

function getRevenueRecognitionConst(type)
{
    if(type == 'create'){
        return JLD_Transaction.Constant.REVENUE_RECOGNITION_CONSTANT;
    }
    else{
        if(!isBlankOrNull(globalValues.salesOrder.getFieldValue(JLD_Transaction.FieldName.REVENUE_RECOGNITION_CONSTANT))){
            return globalValues.salesOrder.getFieldValue(JLD_Transaction.FieldName.REVENUE_RECOGNITION_CONSTANT);
        }else{
            return JLD_Transaction.Constant.REVENUE_RECOGNITION_CONSTANT;
        }
    }
}

function setRevenueRecognitionConstOnSO(){
    var obj = new Object();
    obj.type = "bo"; //bo for body field
    obj.internalid = JLD_Transaction.FieldName.REVENUE_RECOGNITION_CONSTANT;
    obj.value = JLD_Transaction.Constant.REVENUE_RECOGNITION_CONSTANT;
    newSalesorderArray.push(obj);
}

// returns true or false
function isSOLocked(soInternalId)
{
    var recs = nlapiSearchRecord(JLD_Monitor.InternalId, null, new nlobjSearchFilter(JLD_Monitor.FieldName.LOCKED_REC_INTERNAL_ID, null, 'is', soInternalId),null);
    if(recs && recs.length > 0)
        return true;
    else
        return false;
}

function createLock(soInternalId)
{
    var monitor = nlapiCreateRecord(JLD_Monitor.InternalId);
    monitor.setFieldValue(JLD_Monitor.FieldName.LOCKED_REC_INTERNAL_ID, soInternalId);
    var dateTime = new Date();
    //monitor.setFieldValue(JLD_Monitor.FieldName.LOCKED_TIMESTAMP, nlapiDateToString(dateTime, 'datetimetz'));
    monitor.setFieldValue(JLD_Monitor.FieldName.LOCKED_TIMESTAMP, dateTime);
    var monitorId = nlapiSubmitRecord(monitor);
    globalValues.monitorId = monitorId;
    nlapiLogExecution('DEBUG', 'monitor id =', monitorId);
}

function releaseLock()
{
    if(!isBlankOrNull(globalValues.monitorId)){
        nlapiDeleteRecord(JLD_Monitor.InternalId, globalValues.monitorId);
        nlapiLogExecution('DEBUG', 'released the lock on SO');
    }
        
}

function returnActionProcessing(li, alreadyRefunded, returnActionDate)
{
    nlapiLogExecution('DEBUG', 'return action processing ');
    if(alreadyRefunded == "T"){
        if(globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.RETURN_ACTION, li) == JLD_String.For.SOI_RETURN_ACTION_SUPPLIER ){
            nlapiLogExecution('DEBUG', 'performing return to supplier flow');
            var purchaseOrder = null;
            var doFurtherProcessing = false;
            var filters = new Array();
            var columns = new Array();
            var omsPOIRef = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.OMS_POI_REF, li);
            var contractType = null;
            nlapiLogExecution('DEBUG', 'contract type =', globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.CONTRACT_TYPE, li));
            if(globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.CONTRACT_TYPE, li) == JLD_String.For.SOI_CONTRACT_TYPE_OUTRIGHT){
                nlapiLogExecution('DEBUG', 'performing outwright processing');
                if(!isBlankOrNull(omsPOIRef)){
                    nlapiLogExecution('DEBUG', 'oms poi ref =', omsPOIRef);
                    filters.push(new nlobjSearchFilter(JLD_Transaction.ColumnName.OMS_POI_REF, null, 'is', omsPOIRef));
                    filters.push(new nlobjSearchFilter(JLD_Transaction.FieldName.PO_CONTRACT_TYPE, null, 'is', JLD_Transaction.POContractType.OUTRIGHT));
                    columns.push(new nlobjSearchColumn('tranid'));
                    columns.push(new nlobjSearchColumn('quantity'));
                    columns.push(new nlobjSearchColumn('amount'));
                    purchaseOrder = getPurchaseOrder(filters, columns );
                    contractType = JLD_String.For.SOI_CONTRACT_TYPE_OUTRIGHT;
                    doFurtherProcessing = true;
                }
            }
            else if(globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.CONTRACT_TYPE, li) == JLD_String.For.SOI_CONTRACT_TYPE_CONSIGNMENT){
                nlapiLogExecution('DEBUG', 'performing consignment processing');
                if(!isBlankOrNull(omsPOIRef)){
                    filters.push(new nlobjSearchFilter(JLD_Transaction.ColumnName.OMS_POI_REF, null, 'is', omsPOIRef));
                    filters.push(new nlobjSearchFilter(JLD_Transaction.FieldName.PO_CONTRACT_TYPE, null, 'is', JLD_Transaction.POContractType.CONSIGNMENT));
                    filters.push(new nlobjSearchFilter(JLD_Transaction.FieldName.CONSIGNMENT_SALES_PO, null, 'is', 'T'));
                    columns.push(new nlobjSearchColumn('tranid'));
                    columns.push(new nlobjSearchColumn('quantity'));
                    columns.push(new nlobjSearchColumn('amount'));
                    purchaseOrder = getPurchaseOrder(filters, columns);
                    contractType = JLD_String.For.SOI_CONTRACT_TYPE_CONSIGNMENT;
                    doFurtherProcessing = true;
                }
            }
            
            if(doFurtherProcessing == true){
                var crOrTranVenRetAuthResponse = createOrTransformVendorRetAuth(li, purchaseOrder, omsPOIRef, contractType, returnActionDate);
                if(crOrTranVenRetAuthResponse.status == 'failed'){
                    deleteCreatedRecords();
                    return crOrTranVenRetAuthResponse.status;
                }
                var crIFForVRResponse = createItemFulfillmentForVR(li, crOrTranVenRetAuthResponse.vraId, returnActionDate);
                if(crIFForVRResponse.status == "failed"){
                    deleteCreatedRecords();
                    return crIFForVRResponse.status;
                }
                var crVendorCreditResponse = createVendorCredit(li, crOrTranVenRetAuthResponse.vraId, returnActionDate);
                if(crVendorCreditResponse.status == "failed"){
                    deleteCreatedRecords();
                    return crVendorCreditResponse.status;
                }   
                
                // setting already returned actioned flag
                var obj = new Object();
                obj.type = "li";//li for line item field
                obj.internalid = JLD_Transaction.ColumnName.ALREADY_RETURNED_ACTIONED;
                obj.lineNumber = li;
                obj.value = 'T';
                obj.sublist = "item";
                newSalesorderArray.push(obj);
            }
            
            
        }
        else if(globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.RETURN_ACTION, li) == JLD_String.For.SOI_RETURN_ACTION_WRITE_OFF){
            nlapiLogExecution('DEBUG', 'performing write off flow');
            var updateItemReceiptResponse = updateItemReceipt(li, returnActionDate);
            if(updateItemReceiptResponse.status == "failed"){
                deleteCreatedRecords();
                return updateItemReceiptResponse.status;
            }
            // setting already returned actioned flag
            var obj = new Object();
            obj.type = "li";//li for line item field
            obj.internalid = JLD_Transaction.ColumnName.ALREADY_RETURNED_ACTIONED;
            obj.lineNumber = li;
            obj.value = 'T';
            obj.sublist = "item";
            newSalesorderArray.push(obj);
        }
        
    }
    // return passed status
    return "passed";
}

function getItemReceiptId(bobId){
    var filters = new Array();
    filters.push(new nlobjSearchFilter(JLD_Transaction.FieldName.SO_ITEM_ID, null, 'is', bobId));
    filters.push(new nlobjSearchFilter('mainline', null, 'is', 'T'));
    var recs = nlapiSearchRecord('itemreceipt', null, filters , null);
    if(recs && recs.length > 0)
        return recs[0].getId();
    else
        return null;
}

function updateItemReceipt(li, returnActionDate)
{
    nlapiLogExecution('DEBUG', 'updating item receipt');
    var responseObj = new Object();
    responseObj.status = "passed";
    nlapiLogExecution('DEBUG', 'bob id =', globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.BOB_ID, li));
    var itemReceiptId = getItemReceiptId(globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.BOB_ID, li));
    nlapiLogExecution('DEBUG', 'item receipt id', itemReceiptId);
    if(!isBlankOrNull(itemReceiptId)){
        //nlapiLogExecution('DEBUG', 'item receipt id exists');
        // not doing exception handling here since we have fetched the item receipt id from nlapiSearchRecord. Therefore it must exists
        var itemReceipt = nlapiLoadRecord('itemreceipt', itemReceiptId);
                
        // since there will be only one line item on item receipt according to our flow
        itemReceipt.setLineItemValue('item', 'restock', 1, 'F');
        itemReceipt.setFieldValue(JLD_Transaction.FieldName.WRITE_OFF_DATE, returnActionDate);
        try{
            responseObj.itemReceiptId = nlapiSubmitRecord(itemReceipt);
            nlapiLogExecution('DEBUG', 'updated item receipt');
            
        }catch(ex){
            if ( ex instanceof nlobjError )
                nlapiLogExecution( 'ERROR', 'error in updating item receipt', ex.getCode() + '\n' + ex.getDetails() );
            else
                nlapiLogExecution( 'ERROR', 'error in updating item receipt', ex.toString() );
            
            responseObj.status = "failed";
            releaseLock();
        }
    }
    
    return responseObj;
}

function getPurchaseOrder(filters, columns)
{
    var recs = nlapiSearchRecord('purchaseorder', null, filters, columns);
    if(recs && recs.length > 0){
        return recs;
    }else
        return null;
}

function createOrTransformVendorRetAuth(li, purchaseOrder, soOMSPOIRef, contractType, returnActionDate)
{
    nlapiLogExecution('DEBUG', 'creating or transforming vendor return auth');
    var responseObj = new Object();
    var bobId = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.BOB_ID, li);
    
    if(purchaseOrder != null){
        nlapiLogExecution('DEBUG', 'transforming po to vendor ret');
        // since the filters used to fetch the purchase order should only result in one record
        nlapiLogExecution('DEBUG', 'purchase order id=', purchaseOrder[0].getId());
        var vendorRetAuth = nlapiTransformRecord('purchaseorder', purchaseOrder[0].getId(), 'vendorreturnauthorization');
        nlapiLogExecution('DEBUG', 'status ref ini =', vendorRetAuth.getFieldValue('orderstatus'));
        vendorRetAuth.setFieldValue(JLD_Transaction.FieldName.PO_NUMBER, purchaseOrder[0].getValue('tranid'));
        // since the fetched search columns 'quantity' and 'amount' from purchase order aren't giving the accurate count. Therefor loading the purchase order 
        var loadPO = nlapiLoadRecord('purchaseorder', purchaseOrder[0].getId());
        
        var liCount = vendorRetAuth.getLineItemCount('item');
        // according to our flow liCount must be greater than zero therefore not checking this condition
        for(var index =1; index<= liCount; index++){
            nlapiLogExecution('DEBUG', 'vendor line q = ', vendorRetAuth.getLineItemValue('item', 'quantity', index));
            nlapiLogExecution('DEBUG', 'vendor line q = ', vendorRetAuth.getLineItemValue('item', 'amount', index));
            var omsPOIRef = vendorRetAuth.getLineItemValue('item', JLD_Transaction.ColumnName.OMS_POI_REF, index);
            if(omsPOIRef != soOMSPOIRef)
            {
                vendorRetAuth.removeLineItem('item', index);
                index--;
                liCount--;
            }else{
                vendorRetAuth.setLineItemValue('item', 'quantity', index, loadPO.getLineItemValue('item', 'quantity', index));
                vendorRetAuth.setLineItemValue('item', 'amount', index, loadPO.getLineItemValue('item', 'amount', index));
            }
        }
        
        nlapiLogExecution('DEBUG', 'status ref after li =', vendorRetAuth.getFieldValue('orderstatus'));
    }else{
        var vendorRetAuth = nlapiCreateRecord('vendorreturnauthorization');
        vendorRetAuth.setLineItemValue('item', 'item', 1, globalValues.salesOrder.getLineItemValue('item', 'item', li));
        vendorRetAuth.setLineItemValue('item', 'quantity', 1, globalValues.salesOrder.getLineItemValue('item', 'quantity', li));
        vendorRetAuth.setLineItemValue('item', 'description', 1, globalValues.salesOrder.getLineItemValue('item', 'description', li));
        vendorRetAuth.setLineItemValue('item', 'rate', 1, globalValues.salesOrder.getLineItemValue('item', 'rate', li));
        vendorRetAuth.setLineItemValue('item', 'amount', 1, globalValues.salesOrder.getLineItemValue('item', 'amount', li));
        vendorRetAuth.setLineItemValue('item', 'taxcode', 1, globalValues.salesOrder.getLineItemValue('item', 'taxcode', li));
        vendorRetAuth.setLineItemValue('item', 'taxrate1', 1, globalValues.salesOrder.getLineItemValue('item', 'taxrate1', li));
        vendorRetAuth.setLineItemValue('item', 'tax1amt', 1, globalValues.salesOrder.getLineItemValue('item', 'tax1amt', li));
        vendorRetAuth.setLineItemValue('item', 'grossamt', 1, globalValues.salesOrder.getLineItemValue('item', 'grossamt', li));
        vendorRetAuth.setLineItemValue('item', 'isclosed', 1, globalValues.salesOrder.getLineItemValue('item', 'isclosed', li));
        vendorRetAuth.setLineItemValue('item', JLD_Transaction.FieldName.OMS_UID, 1, globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.FieldName.OMS_UID, li));
        vendorRetAuth.setLineItemValue('item', JLD_Transaction.FieldName.OMS_POI_REF, 1, soOMSPOIRef);
        vendorRetAuth.setLineItemValue('item', JLD_Transaction.FieldName.BOB_ID, 1, bobId);
    
    }
    vendorRetAuth.setLineItemValue('item', 'location', 1, JLD_Transaction.Location.CUSTOMER_RETURNS_QC_FAILED);
     
    if(contractType == JLD_String.For.SOI_CONTRACT_TYPE_OUTRIGHT){
        vendorRetAuth.setLineItemValue('item', JLD_Transaction.ColumnName.OMS_UID_COST, 1, globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.OMS_UID_COST, li));
    }else if(contractType == JLD_String.For.SOI_CONTRACT_TYPE_CONSIGNMENT){
        vendorRetAuth.setLineItemValue('item', JLD_Transaction.ColumnName.CONSIGNMENT_PRICE, 1, globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.CONSIGNMENT_PRICE, li));
    }
    nlapiLogExecution('DEBUG', 'status ref uid cost =', vendorRetAuth.getFieldValue('orderstatus'));    
    vendorRetAuth.setFieldValue(JLD_Transaction.FieldName.SO_NUMBER, globalValues.soTranid);
    vendorRetAuth.setFieldValue(JLD_Transaction.FieldName.SO_ITEM_ID, bobId);
    vendorRetAuth.setFieldValue(JLD_Transaction.FieldName.POI_REFENCE, soOMSPOIRef);
    vendorRetAuth.setFieldValue(JLD_Transaction.FieldName.RETURN_INITIATED_BY, JLD_String.For.RETURN_INITIATED_BY);
    
    vendorRetAuth.setFieldValue('tranid', getSubPrefix(globalValues.soTranid) + '_VRQCF_' + getNumber(bobId));
    vendorRetAuth.setFieldValue('externalid', getSubPrefix(globalValues.soTranid) + '_VRQCF_' + getNumber(bobId));
    vendorRetAuth.setFieldValue('trandate', getDate(returnActionDate));
    nlapiLogExecution('DEBUG', 'status ref after trandate =', vendorRetAuth.getFieldValue('orderstatus'));
    try{
        responseObj.vraId = nlapiSubmitRecord(vendorRetAuth, true, true);
        nlapiLogExecution('DEBUG', 'vendor return auth id', responseObj.vraId);
        responseObj.status = "passed";
        
        var obj = new Object();
        obj.type = 'vendorreturnauthorization';
        obj.internalId = responseObj.vraId;
        recordsToBeDeleted.push(obj);
        
    }catch(ex){
        if(ex instanceof nlobjError){
            nlapiLogExecution('ERROR', 'Error in creating vendor return auth' + ex.getCode() + ', ' + ex.getDetails());
        } else {
            nlapiLogExecution('ERROR', 'Error in creating vendor return auth', ex.toString());
        }
        responseObj.status = "failed";
        releaseLock();
    }
    
    return responseObj;
}

function createItemFulfillmentForVR(li, vendorReturnId, returnActionDate)
{
    var responseObj = new Object();
    nlapiLogExecution('DEBUG', 'creating item fullfillment for vendor return');
    var itemFullfill = nlapiTransformRecord('vendorreturnauthorization', vendorReturnId, 'itemfulfillment');
    nlapiLogExecution('DEBUG', 'debug: transformed to imtemfullfillment');
    itemFullfill.setFieldValue('trandate', getDate(returnActionDate) );
    itemFullfill.setFieldValue('tranid', getSubPrefix(globalValues.soTranid) + '_IFQCF_' + getNumber(globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.BOB_ID, li)));
    itemFullfill.setFieldValue('externalid', getSubPrefix(globalValues.soTranid) + '_IFQCF_' + getNumber(globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.BOB_ID, li)));
    itemFullfill.setFieldValue(JLD_Transaction.FieldName.TYPE_OF_FULFILLMENT, JLD_String.For.VENDOR_TYPE_OF_FULFILLMENT);
    itemFullfill.setFieldValue('shipstatus','C');
    
    try
    {
        responseObj.ifId = nlapiSubmitRecord(itemFullfill, true, true);
        nlapiLogExecution('DEBUG', 'vendor return item fullfillment  rec id =', responseObj.ifId);
        responseObj.status = "passed";
        
        var obj = new Object();
        obj.type = 'itemfulfillment';
        obj.internalId = responseObj.ifId;
        recordsToBeDeleted.push(obj);
    
    }catch(ex){
        if ( ex instanceof nlobjError )
            nlapiLogExecution( 'ERROR', 'error in creating vendor ret item fullfillment', ex.getCode() + '\n' + ex.getDetails() );
        else
            nlapiLogExecution( 'ERROR', 'error in creating vendor ret item fullfillment', ex.toString() );
        responseObj.status = "failed";
        releaseLock();
    }
    
    return responseObj;
    
}

function createVendorCredit(li, vendorReturnId, returnActionDate)
{
    var responseObj = new Object();
    
    nlapiLogExecution('DEBUG', 'creating vendor credit');
    var vendorCredit = nlapiTransformRecord('vendorreturnauthorization', vendorReturnId, 'vendorcredit');
    nlapiLogExecution('DEBUG', 'debug: transformed to vendor credit');
    vendorCredit.setFieldValue('trandate', getDate(returnActionDate) );
    vendorCredit.setFieldValue('tranid', getSubPrefix(globalValues.soTranid) + '_VCQCF_' + getNumber(globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.BOB_ID, li)));
    vendorCredit.setFieldValue('externalid', getSubPrefix(globalValues.soTranid) + '_VCQCF_' + getNumber(globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.BOB_ID, li)));
    vendorCredit.setFieldValue(JLD_Transaction.FieldName.TYPE_OF_FULFILLMENT, JLD_String.For.VENDOR_TYPE_OF_FULFILLMENT);
    
    try
    {
        responseObj.vcId = nlapiSubmitRecord(vendorCredit, true, true);
        nlapiLogExecution('DEBUG', 'vendor credit rec id =', responseObj.vcId);
        responseObj.status = "passed";
        
        var obj = new Object();
        obj.type = 'vendorcredit';
        obj.internalId = responseObj.vcId;
        recordsToBeDeleted.push(obj);
    
    }catch(ex){
        if ( ex instanceof nlobjError )
            nlapiLogExecution( 'ERROR', 'error in creating vendor credit', ex.getCode() + '\n' + ex.getDetails() );
        else
            nlapiLogExecution( 'ERROR', 'error in creating vendor credit', ex.toString() );
        responseObj.status = "failed";
        releaseLock();
    }
    
    return responseObj;
    
}