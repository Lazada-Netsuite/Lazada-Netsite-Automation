/*
 * 
 * Auhors: Mohammed & Kalyan
 * 
   Date : 27th Oct 2013
   
  Module Description : Consignment Process
   */


var globalConsignmentCost = 0;
/* *************** Calling Module for Test Disabled *******************************
function consignmentProcess()
{
	try
	{
		recordId = nlapiGetRecordId();
		var recordType = nlapiGetRecordType();
		globalValues.salesOrder = nlapiLoadRecord(recordType, recordId);
		tranDate = globalValues.salesOrder.getFieldValue('trandate');
		
		var itemCount = globalValues.salesOrder.getLineItemCount('item');
		
		 for(itIdx=1; itIdx <= itemCount; itIdx ++)
		{
			 var itemType = globalValues.salesOrder.getLineItemValue('item', 'itemtype', itIdx)
			 
			 if(itemType == 'InvtPart')
			{
				 if((globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.ALREADY_SHIPPED, itIdx) == 'T'))
				 {
					 processVendorTransaction(itIdx, LAZADA_CONSIGNMENT.Constant.VENDOR_BILL);
				 }
				 
				 if((globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.ALREADY_RETURNED, itIdx) == 'T'))
				{
					 
					 processVendorTransaction(itIdx,LAZADA_CONSIGNMENT.Constant.VENDOR_CREDIT); 
				}
				
			}
			 
		}
		
		
		try
		{
			nlapiSubmitRecord(globalValues.salesOrder,true,true);
		}
		catch(ex)
		{
			nlapiLogExecution('ERROR', 'Error in submitting sales order', ex.toString());
		}
	}
	catch(ex)
	{
		nlapiLogExecution('ERROR', 'Error in Loading sales order', ex.toString());
		return ex.message;
	}

}

*****************************************************************************************************************/
function processVendorTransaction(li, Mode)
{
	try
	{
		globalConsignmentCost = 0;
		
		if((Mode!=LAZADA_CONSIGNMENT.Constant.VENDOR_BILL) && (Mode!=LAZADA_CONSIGNMENT.Constant.VENDOR_CREDIT))
		{
			return;
		}
		
		var contractType = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.CONTRACT_TYPE, li);
		
		
		if(contractType!= LAZADA_CONSIGNMENT.Constant.CONSIGNMENT_CONTRACT)
		{
			return;
		}
		
		
			if(Mode==LAZADA_CONSIGNMENT.Constant.VENDOR_BILL)
			{
				var saleBillReference=  globalValues.salesOrder.getLineItemValue('item',JLD_Transaction.ColumnName.CONSIGNMENT_SALE_BILL_REFERENCE, li);
				
				if(checkBlankOrNull(saleBillReference,0)!=0)
				{
					return;
				}
			}
			
			if(Mode==LAZADA_CONSIGNMENT.Constant.VENDOR_CREDIT)
			{
				var returnBillReference=  globalValues.salesOrder.getLineItemValue('item',JLD_Transaction.ColumnName.CONSIGNMENT_RETURN_BILL_REFERENCE, li);
				
				if(checkBlankOrNull(returnBillReference,0)!=0)
				{
					return;
				}
			}
			
		
		var vendorId =  globalValues.salesOrder.getLineItemValue('item',JLD_Transaction.ColumnName.SO_ITEM_CONSIGNMENT_VENDOR, li);	
		
		if(checkBlankOrNull(vendorId,0)==0)
		{
			return;
		}

		var itemId = globalValues.salesOrder.getLineItemValue('item','item', li);
		var tranDate = globalValues.salesOrder.getFieldValue('trandate');
	
		 if(Mode==LAZADA_CONSIGNMENT.Constant.VENDOR_BILL)
		{
			  globalConsignmentCost = getConsignmentCost(itemId,vendorId,tranDate);
			 /**********Set Sales Order line Object********/
			
			  
			  var obj = new Object();
			    obj.type = "li";//li for line item field
			    obj.internalid = JLD_Transaction.ColumnName.CONSIGNMENT_PRICE;
			    obj.lineNumber = li;
			    obj.value = globalConsignmentCost;
			    obj.sublist = "item";
			    newSalesorderArray.push(obj);
			   
			  /**********Set Sales Order line Object********/
			    
			 processVendorBillOrCredit(LAZADA_CONSIGNMENT.Constant.VENDOR_BILL,LAZADA_CONSIGNMENT.Constant.VENDOR_BILL_PREFIX,vendorId,li);	
		}
		else if(Mode==LAZADA_CONSIGNMENT.Constant.VENDOR_CREDIT)
		{
			  processVendorBillOrCredit(LAZADA_CONSIGNMENT.Constant.VENDOR_CREDIT,LAZADA_CONSIGNMENT.Constant.VENDOR_CREDIT_PREFIX,vendorId,li);	
		}
	}
	catch(ex)
	{
		 nlapiLogExecution('DEBUG', 'Error Process Vendor Transaction', ex.toString());
	}
}


function processVendorBillOrCredit(type,tranTypePrefix,vendorId,soItemIdx)
{
	
	try
	{
		
		
		var vendorName =  globalValues.salesOrder.getLineItemText('item',JLD_Transaction.ColumnName.SO_ITEM_CONSIGNMENT_VENDOR, soItemIdx);
		var vendorTranExternalId = getCurrentMonthBill(tranTypePrefix,vendorName,globalValues.salesOrder.getFieldValue('trandate')).replace(/ /g, "_");
		
		var billOrCreditId = searchVendorProcessingId(type, vendorTranExternalId, vendorId);
	
			var tranResponse;
			
			 tranResponse = processBillOrCredit(type,billOrCreditId,soItemIdx,vendorId,vendorTranExternalId);
			
			if(tranResponse.status)
			{
				//Set Vendor bill reference in sales order RETURN_BILL_REF 'vendorbill'
				
				if(type == LAZADA_CONSIGNMENT.Constant.VENDOR_BILL)
				{
					 /* *********Set Sales Order line Object for Bill Ref********/
					  
					  var obj = new Object();
					    obj.type = "li";//li for line item field
					    obj.internalid = JLD_Transaction.ColumnName.CONSIGNMENT_SALE_BILL_REFERENCE;
					    obj.lineNumber = soItemIdx;
					    obj.value = tranResponse.billOrCreditInternalId;
					    obj.sublist = "item";
					    newSalesorderArray.push(obj);
					   
				}
				
				if(type == LAZADA_CONSIGNMENT.Constant.VENDOR_CREDIT)
				{
					 /* *********Set Sales Order line Object for Return Bill Ref********/
					  var obj = new Object();
					    obj.type = "li";//li for line item field
					    obj.internalid = JLD_Transaction.ColumnName.CONSIGNMENT_RETURN_BILL_REFERENCE;
					    obj.lineNumber = soItemIdx;
					    obj.value = tranResponse.billOrCreditInternalId;
					    obj.sublist = "item";
					    newSalesorderArray.push(obj);
				}
			}
			
		//return tranResponse.status;
	}
	catch(ex)
	{
		 nlapiLogExecution('DEBUG', 'Error Process Vendor Bill', ex.toString());
	}

}


function processBillOrCredit(type,billOrCreditId,soItemIdx,vendorId,vendorTranExternalId)
{
	 var responseObj = new Object();
	 
	try
	{
		var billOrCreditRecord;
		
        if (billOrCreditId==null)
        {
        	 billOrCreditRecord = nlapiCreateRecord(type, {recordmode: 'dynamic'});
        	 billOrCreditRecord.setFieldValue('entity', vendorId);
        	 billOrCreditRecord.setFieldValue('tranid', vendorTranExternalId);
        	 billOrCreditRecord.setFieldValue('trandate', getLastDay(globalValues.salesOrder.getFieldValue('trandate')));
        }
        else
        {//update
        	billOrCreditRecord = nlapiLoadRecord(type, billOrCreditId, {recordmode: 'dynamic'});
        }
             
		var itemId = checkBlankOrNull( globalValues.salesOrder.getLineItemValue('item','item', soItemIdx),0);
		var locationId = checkBlankOrNull(globalValues.salesOrder.getLineItemValue('item','location', soItemIdx),0);
		
		var omsUid = checkBlankOrNull(globalValues.salesOrder.getLineItemValue('item',LAZADA_CONSIGNMENT.ColumnName.OMS_UID, soItemIdx),0);
		var poiOmsRef = checkBlankOrNull(globalValues.salesOrder.getLineItemValue('item',LAZADA_CONSIGNMENT.ColumnName.POI_REF, soItemIdx),0);
		var bobId = checkBlankOrNull(globalValues.salesOrder.getLineItemValue('item',JLD_Transaction.ColumnName.BOB_ID, soItemIdx),0);
		
		/********************** item Sublist Begin *****************************/
		billOrCreditRecord.insertLineItem('item', 1);
		billOrCreditRecord.setCurrentLineItemValue('item', 'item', itemId);
		billOrCreditRecord.setCurrentLineItemValue('item', 'quantity', 0);
		billOrCreditRecord.setCurrentLineItemValue('item', 'rate', 0);
		
		
		billOrCreditRecord.setCurrentLineItemValue('item', LAZADA_CONSIGNMENT.ColumnName.OMS_UID, omsUid);
		billOrCreditRecord.setCurrentLineItemValue('item', LAZADA_CONSIGNMENT.ColumnName.POI_REF, poiOmsRef);
		billOrCreditRecord.setCurrentLineItemValue('item', LAZADA_CONSIGNMENT.ColumnName.SO_BILL_REF, globalValues.salesOrder.id);
		billOrCreditRecord.setCurrentLineItemValue('item', JLD_Transaction.ColumnName.BOB_ID, bobId);
		billOrCreditRecord.setCurrentLineItemValue('item', 'location', locationId);
		
		billOrCreditRecord.setCurrentLineItemValue('item', 'custcol_4601_witaxapplies', 'T');
		
		var withHoldingTaxCode = getWithHoldingTax(itemId,vendorId,LAZADA_CONSIGNMENT.WithHoldingTax.ON_PURCHASE);
		billOrCreditRecord.setCurrentLineItemValue('item', 'custcol_4601_witaxcode', withHoldingTaxCode);
		billOrCreditRecord.commitLineItem('item');

		
		/********************** item Sublist End *****************************/
		
		
		/********************** Expense Sublist Begin *****************************/
		billOrCreditRecord.insertLineItem('expense', 1);
		billOrCreditRecord.setCurrentLineItemValue('expense', 'account', LAZADA_CONSIGNMENT.Constant.EXPENSE_ACCOUNT_ID); 
		billOrCreditRecord.setCurrentLineItemValue('expense', 'amount',  globalConsignmentCost);
		billOrCreditRecord.setCurrentLineItemValue('expense', 'location', locationId);
		
		billOrCreditRecord.setCurrentLineItemValue('expense', LAZADA_CONSIGNMENT.ColumnName.OMS_UID,  omsUid);
		billOrCreditRecord.setCurrentLineItemValue('expense', LAZADA_CONSIGNMENT.ColumnName.POI_REF, poiOmsRef);  	
		
		billOrCreditRecord.setCurrentLineItemValue('expense', LAZADA_CONSIGNMENT.ColumnName.SO_BILL_REF, globalValues.salesOrder.id);
		billOrCreditRecord.setCurrentLineItemValue('expense', JLD_Transaction.ColumnName.BOB_ID, bobId);
		
		var itemTaxCode = billOrCreditRecord.getLineItemValue('item','taxcode',1);
		billOrCreditRecord.setCurrentLineItemValue('expense', 'taxcode', itemTaxCode);
		
		billOrCreditRecord.setCurrentLineItemValue('expense', 'custcol_4601_witaxapplies','T');
		billOrCreditRecord.setCurrentLineItemValue('expense', 'custcol_4601_witaxcode_exp',withHoldingTaxCode);	
		billOrCreditRecord.commitLineItem('expense');
		
		/********************** Expense Sublist End *****************************/
	
		try
	    {
			var billOrCreditInternalId = nlapiSubmitRecord(billOrCreditRecord);
			responseObj.billOrCreditInternalId = billOrCreditInternalId;
			responseObj.status = true;
	    }
		catch(ex)
		{
			 nlapiLogExecution( 'ERROR', 'error in Updating vendor Bill', ex.toString());
			 responseObj.status = false;
		}

	}
	catch(ex)
	{
		 nlapiLogExecution('DEBUG', 'Error in Create/Update Vendor transaction', ex.toString());
	}

	return responseObj;
}

function getCurrentMonthBill(tranprefixType,vendorExtId,tranDate)
{
	try
	{
		var currentMonthBill = getSubsidiaryPrefix() + tranprefixType + vendorExtId.replace(getSubsidiaryPrefix(), "") + '_' +  getCurrentMonthYear(tranDate);
		return currentMonthBill;
		
	}
	catch(ex)
	{
		 nlapiLogExecution('DEBUG', 'Error in Current Month Bill', ex.toString());
	}


}

function getSubsidiaryPrefix()
{
	try
	{
		var prefix = checkBlankOrNull(globalValues.salesOrder.getFieldValue('tranid'),0);
		var transactionPrefix = prefix.split('_');
	    return transactionPrefix[0] + '_';

	}
	catch(ex)
	{
		 nlapiLogExecution('DEBUG', 'Error in subsidiary Preix', ex.toString());
	}

}

function getCurrentMonthYear(tranDate)
{	
	try
	{
		var splitDate = tranDate.split("/");
		return (splitDate[1]) + "_" + splitDate[2] ;
		
	}
	catch(ex)
	{
		 nlapiLogExecution('DEBUG', 'Error in Current Month and Year', ex.toString());
	}

}


function getLastDay(tranDate)
{
	try
	{
		var splitDate = tranDate.split("/");
		var year = splitDate[2];
		var month = splitDate[1];
		var day = splitDate[0];
		
		var date = new Date(year,month - 1, day);
		var lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0);
	    return lastDay.getDate()+"/"+(lastDay.getMonth()+ 1) +"/"+lastDay.getFullYear(); 
	}
	catch(ex)
    {
	    return '';
	 }

}

function searchVendorProcessingId(recorType, tranId, vendorId)
{
	
		var filters = new Array();
		filters[0] = new nlobjSearchFilter( 'tranid', null, 'is', tranId);
		filters[1] = new nlobjSearchFilter('entity', null, 'anyof', vendorId);
		filters[2] = new nlobjSearchFilter( 'mainline', null, 'is', 'T' );
		
		var venInternalIdColumn =new Array();
		venInternalIdColumn[0] = new nlobjSearchColumn ("internalid");
		var searchresults = nlapiSearchRecord(recorType, null, filters, venInternalIdColumn);
	
		return (searchresults != null)? searchresults[0].getValue('internalid') : null;

}

//Function to Check Blank or Null
function checkBlankOrNull(stringParam,defaultValue)
{
	try
	{
		if(stringParam == null || stringParam == '' || stringParam == 'null')
		{
			return defaultValue;
		}
		else
		{
			return stringParam;	
		}	
	}
	catch(ex)
    {
	    nlapiLogExecution('DEBUG', 'Error In Check Blank Or Null', ex.toString());
	 }
}

function getConsignmentCost(itemId,vendorId,tranDate)
{
	if(tranDate == null || tranDate == '')
	{
		return null;
	}
	
	var promotionFilters = new Array();
	promotionFilters[0] = new nlobjSearchFilter(LAZADA_CONSIGNMENT.CustomRecord.PRO_VENDOR, null, 'anyof', vendorId);
	promotionFilters[1] = new nlobjSearchFilter(LAZADA_CONSIGNMENT.CustomRecord.PRO_ITEM, null, 'anyof', itemId);
	promotionFilters[2] = new nlobjSearchFilter(LAZADA_CONSIGNMENT.CustomRecord.PRO_FR_DATE, null, 'onorafter', tranDate);
	promotionFilters[3] = new nlobjSearchFilter(LAZADA_CONSIGNMENT.CustomRecord.PRO_TO_DATE, null, 'onorbefore', tranDate);  

	var promotionColumns = new Array();
	promotionColumns[0]=new nlobjSearchColumn (LAZADA_CONSIGNMENT.CustomRecord.PRO_COST); //cost
	promotionColumns[1]=new nlobjSearchColumn ('internalid');
	promotionColumns[2]=new nlobjSearchColumn (LAZADA_CONSIGNMENT.CustomRecord.PRO_FR_DATE).setSort(true);
	
	
   var promotionResults = nlapiSearchRecord(LAZADA_CONSIGNMENT.CustomRecord.PROMOTION_TABLE, null, promotionFilters, promotionColumns);

   	if(promotionResults == null)
	{
	   var priceFilters = new Array();
	   priceFilters[0] = new nlobjSearchFilter(LAZADA_CONSIGNMENT.CustomRecord.CON_VENDOR, null, 'anyof', vendorId);
	   priceFilters[1] = new nlobjSearchFilter(LAZADA_CONSIGNMENT.CustomRecord.CON_ITEM, null, 'anyof', itemId);
	   priceFilters[2] = new nlobjSearchFilter(LAZADA_CONSIGNMENT.CustomRecord.CON_FR_DATE, null, 'onorafter', tranDate);
	   
	   
	   var priceColumns = new Array();
	   priceColumns[0]=new nlobjSearchColumn (LAZADA_CONSIGNMENT.CustomRecord.CON_COST); 
	   priceColumns[1]=new nlobjSearchColumn ('internalid');
	   priceColumns[2]=new nlobjSearchColumn (LAZADA_CONSIGNMENT.CustomRecord.CON_FR_DATE).setSort(true);
	   
	   var priceResult = nlapiSearchRecord(LAZADA_CONSIGNMENT.CustomRecord.INVENTORY_TABLE, null, priceFilters, priceColumns);
	   
	   if(priceResult != null)
		{
		   return priceResult[0].getValue(LAZADA_CONSIGNMENT.CustomRecord.CON_COST); 
		}
	   
	}
   	else
  {
   	 return promotionResults[0].getValue(LAZADA_CONSIGNMENT.CustomRecord.PRO_COST); //cost
   }
   

}


function getWithHoldingTax(itemId,entityId,tranType)
{
	try
	{
	
		if((tranType != LAZADA_CONSIGNMENT.WithHoldingTax.ON_PURCHASE) && (tranType != LAZADA_CONSIGNMENT.WithHoldingTax.ON_SALE))
		{
			return ;
		}
		
		var whTaxCode;
		
		var itemRecord = nlapiLoadRecord('inventoryitem', itemId);
		
		var entityRecord;
		
		if(tranType == LAZADA_CONSIGNMENT.WithHoldingTax.ON_PURCHASE)
		{
			entityRecord = nlapiLoadRecord('vendor', entityId);
		}
	
		if(tranType == LAZADA_CONSIGNMENT.WithHoldingTax.ON_SALE)
		{
			entityRecord = nlapiLoadRecord('customer', entityId);
		}
	
		
		var itemWhtCodeId = itemRecord.getFieldValue('custitem_4601_defaultwitaxcode');
		
		if((itemWhtCodeId == null) || (itemWhtCodeId == ''))
		{
			 whTaxCode = entityRecord.getFieldValue('custentity_4601_defaultwitaxcode');
			return whTaxCode;
			
		}
		else
		{
			var whtCodeRecord = nlapiLoadRecord('customrecord_4601_witaxcode', itemWhtCodeId);	
			
			if((whtCodeRecord != null) && (whtCodeRecord != ''))
			{
				var whtCodeType = whtCodeRecord.getFieldValue('custrecord_4601_wtc_availableon');
				var whtRate =  whtCodeRecord.getFieldValue('custrecord_4601_wtc_rate');
				
				if(tranType == whtCodeType || whtCodeType == LAZADA_CONSIGNMENT.WithHoldingTax.BOTH)
				{
					whTaxCode = itemWhtCodeId;
					return whTaxCode;
				}
				
			}
			else
			{
				var whTaxCode = entityRecord.getFieldValue('custentity_4601_defaultwitaxcode');		
				return whTaxCode;
			}
		
			
		}
		
	}
	catch(ex)
	{
		
		 nlapiLogExecution('DEBUG', 'Error in With holding tax', ex.toString());
	}

}


