/*
 * 
 * Auhors: Mohammed & Kalyan
 * 
   Date : 27th Oct 2013 CONSIGNMENT PO User event
   
  Module Description : Consignment Process
   */

var globalConsignmentCost = 0;
var globalValues = new Object();
var newSalesorderArray = new Array();
function consignmentTransaction()
{
	try
	{
		var recordId = nlapiGetRecordId();
		var recordType = nlapiGetRecordType();
		globalValues.salesOrder = nlapiLoadRecord(recordType, recordId);

		 
		var itemCount = globalValues.salesOrder.getLineItemCount('item');
		
		 for(var itIdx=1; itIdx <= itemCount; itIdx ++)
		{
			 var itemType = globalValues.salesOrder.getLineItemValue('item', 'itemtype', itIdx);
			 
			 if(itemType == 'InvtPart')
			{
				 if((globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.ALREADY_FULFILLED, itIdx) == 'T'))
				 {
					 processConsignmentTransaction(itIdx, LAZADA_CONSIGNMENT.Constant.CONSIGNMENT_PURCHASE_ORDER);
				 }
				 
				 //Additional consignment po order checking for vendor return
				 var consigmentPoReference=  globalValues.salesOrder.getLineItemValue('item',LAZADA_CONSIGNMENT.ColumnName.CONSIGNMENT_PO_REF, itIdx);
					
				 
				 if((globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.ALREADY_RETURNED, itIdx) == 'T') && checkBlankOrNull(consigmentPoReference,0)!=0)
				{
					 
					 processConsignmentTransaction(itIdx,LAZADA_CONSIGNMENT.Constant.CONSIGNMENT_VENDOR_RETURN); 
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


function processConsignmentTransaction(li, Mode)
{
	try
	{
		globalConsignmentCost = 0;
		
		if((Mode!=LAZADA_CONSIGNMENT.Constant.CONSIGNMENT_PURCHASE_ORDER) && (Mode!=LAZADA_CONSIGNMENT.Constant.CONSIGNMENT_VENDOR_RETURN))
		{
			return;
		}
		
		var contractType = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.CONTRACT_TYPE, li);
		
		
		if(contractType!= LAZADA_CONSIGNMENT.Constant.CONSIGNMENT_CONTRACT)
		{
			return;
		}
		
		//var saleBillReference=  globalValues.salesOrder.getLineItemValue('item',JLD_Transaction.ColumnName.CONSIGNMENT_SALE_BILL_REFERENCE, li);
		
		//Adjust Inventory 
		
		
			if(Mode==LAZADA_CONSIGNMENT.Constant.CONSIGNMENT_PURCHASE_ORDER)
			{
				var consigmentPoReference=  globalValues.salesOrder.getLineItemValue('item',LAZADA_CONSIGNMENT.ColumnName.CONSIGNMENT_PO_REF, li);
				
				if(checkBlankOrNull(consigmentPoReference,0)!=0)
				{
					return;
				}
			}
			
			if(Mode==LAZADA_CONSIGNMENT.Constant.CONSIGNMENT_VENDOR_RETURN)
			{
				var consigmentReturnPoReference=  globalValues.salesOrder.getLineItemValue('item',LAZADA_CONSIGNMENT.ColumnName.CONSIGNMENT_RETURN_REF, li);
				
				if(checkBlankOrNull(consigmentReturnPoReference,0)!=0)
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
		
		 globalConsignmentCost = checkBlankOrNull((getConsignmentCost(itemId,vendorId,globalValues.salesOrder.getFieldValue('trandate'))),0);
	
		 if(Mode==LAZADA_CONSIGNMENT.Constant.CONSIGNMENT_PURCHASE_ORDER)
		{
			 var adjustInvSuccess = processConsignmentInventoryAdjustment(li);
				
				if(adjustInvSuccess.status == false)
				{
					return;
				}
				
			 processConsignmentPurchaseOrReturn(LAZADA_CONSIGNMENT.Constant.CONSIGNMENT_PURCHASE_ORDER,LAZADA_CONSIGNMENT.Constant.PURCHASE_PREFIX,vendorId,li);	
		}
		else if(Mode==LAZADA_CONSIGNMENT.Constant.CONSIGNMENT_VENDOR_RETURN)
		{
			processConsignmentPurchaseOrReturn(LAZADA_CONSIGNMENT.Constant.CONSIGNMENT_VENDOR_RETURN,LAZADA_CONSIGNMENT.Constant.RETURN_PREFIX,vendorId,li);	
		}
	}
	catch(ex)
	{
		 nlapiLogExecution('DEBUG', 'Error Process Vendor Transaction', ex.toString());
	}
}




function processConsignmentInventoryAdjustment(soItemIdx)
{
	
	var responseObj = new Object();
	
	var inventoryAdjustmentId = getCurrentMonthAdjustInvenotoryId();
	
	var inventoryAdjustmentInternalId = searchPoProcessingId('inventoryadjustment', inventoryAdjustmentId, null);
	
	
	try
	{
		var adjustInventoryRecord;
		
        if (inventoryAdjustmentInternalId==null)
        {
        	adjustInventoryRecord = nlapiCreateRecord('inventoryadjustment', {recordmode: 'dynamic'});
        	adjustInventoryRecord.setFieldValue('subsidiary', globalValues.salesOrder.getFieldValue('subsidiary'));
        	adjustInventoryRecord.setFieldValue('account', LAZADA_CONSIGNMENT.Constant.EXPENSE_ACCOUNT_ID);
        	adjustInventoryRecord.setFieldValue('tranid', inventoryAdjustmentId);
        }
        else
        {
        	adjustInventoryRecord = nlapiLoadRecord('inventoryadjustment', inventoryAdjustmentInternalId, {recordmode: 'dynamic'});
        }
        
	
		var itemId = checkBlankOrNull( globalValues.salesOrder.getLineItemValue('item','item', soItemIdx),0);
		var subsidiaryPrefix = getSubsidiaryPrefix().replace("_", "");
		var locationId = LAZADA_CONSIGNMENT[subsidiaryPrefix][LAZADA_CONSIGNMENT.Constant.WARE_HOUSE];
	//	var locationId = checkBlankOrNull(globalValues.salesOrder.getLineItemValue('item','location', soItemIdx),0);
		
		adjustInventoryRecord.insertLineItem('inventory', 1);
		adjustInventoryRecord.setCurrentLineItemValue('inventory', 'item', itemId);
		adjustInventoryRecord.setCurrentLineItemValue('inventory', 'location', locationId);
		//Decreasing quantity by 1 so we are setting -1 in adjust inventory
		adjustInventoryRecord.setCurrentLineItemValue('inventory', 'adjustqtyby', -1);
		adjustInventoryRecord.commitLineItem('inventory');
		
		
		try
	    {
			var invadjInternalId = nlapiSubmitRecord(adjustInventoryRecord);
			responseObj.invadjInternalId = invadjInternalId;
			responseObj.status = true;

	    }
		catch(ex)
		{
			 nlapiLogExecution( 'ERROR', 'error in Update Inventory Adjustment Record', ex.toString());
			 responseObj.status = false;
		}

	
	}
	catch(ex)
    {
	    nlapiLogExecution('DEBUG', 'Error In Adjust Inventory', ex.toString());
	    
	    responseObj.status =  false;
	 }
	
	return responseObj;
	
}

function processConsignmentPurchaseOrReturn(type,tranTypePrefix,vendorId,soItemIdx)
{
	
	try
	{
		
		
		var vendorName =  globalValues.salesOrder.getLineItemText('item',JLD_Transaction.ColumnName.SO_ITEM_CONSIGNMENT_VENDOR, soItemIdx);
		var purchaseTranExternalId = getCurrentMonthPurchase(tranTypePrefix,vendorName, globalValues.salesOrder.getFieldValue('trandate')).replace(/ /g, "_");
		
		var purchaseOrReturnId = searchPoProcessingId(type, purchaseTranExternalId, vendorId);
	
			var tranResponse='';
			
			//Commented -> This was common function for both Independent consignment po and Consignment vendor return authorization
			//tranResponse = processPurchaseOrReturn(type,purchaseOrReturnId,soItemIdx,vendorId,purchaseTranExternalId);
			
			if(type == LAZADA_CONSIGNMENT.Constant.CONSIGNMENT_PURCHASE_ORDER)
			{
				tranResponse = processPurchaseOrReturn(type,purchaseOrReturnId,soItemIdx,vendorId,purchaseTranExternalId);
			}
			
			
			if(type == LAZADA_CONSIGNMENT.Constant.CONSIGNMENT_VENDOR_RETURN)
			{
				tranResponse = processVendorReturnTransformation(type,soItemIdx);
			}
			
			if(tranResponse.status)
			{
				//Set Vendor bill reference in sales order RETURN_BILL_REF 'vendorbill'
				
				if(type == LAZADA_CONSIGNMENT.Constant.CONSIGNMENT_PURCHASE_ORDER)
				{
					 globalValues.salesOrder.setLineItemValue('item',LAZADA_CONSIGNMENT.ColumnName.CONSIGNMENT_PO_REF, soItemIdx, tranResponse.purchaseOrReturnInternalId);
					 
					//Update in sales order line item
						var obj = new Object();
				        obj.type = "li";//li for line item field
				        obj.internalid = LAZADA_CONSIGNMENT.ColumnName.CONSIGNMENT_PO_REF;
				        obj.lineNumber = soItemIdx;
				        obj.value = tranResponse.purchaseOrReturnInternalId;
				        obj.sublist = "item";
				        newSalesorderArray.push(obj);
				        
				        globalValues.salesOrder.setLineItemValue('item',LAZADA_CONSIGNMENT.ColumnName.CONSIGNMENT_PRICE, soItemIdx, globalConsignmentCost);
				}
				
				if(type == LAZADA_CONSIGNMENT.Constant.CONSIGNMENT_VENDOR_RETURN)
				{
					//Commented -> This was common function for both Independent consignment po and Consignment vendor return authorization
					 //globalValues.salesOrder.setLineItemValue('item',LAZADA_CONSIGNMENT.ColumnName.CONSIGNMENT_RETURN_REF, soItemIdx, tranResponse.purchaseOrReturnInternalId);
					globalValues.salesOrder.setLineItemValue('item',LAZADA_CONSIGNMENT.ColumnName.CONSIGNMENT_RETURN_REF, soItemIdx, tranResponse.vendorReturnId);
					
					//Update in sales order line item
					var obj = new Object();
			        obj.type = "li";//li for line item field
			        obj.internalid = LAZADA_CONSIGNMENT.ColumnName.CONSIGNMENT_RETURN_REF;
			        obj.lineNumber = soItemIdx;
			        obj.value = tranResponse.vendorReturnId;
			        obj.sublist = "item";
			        newSalesorderArray.push(obj);
					
				}
			}
			
		//return tranResponse.status;
	}
	catch(ex)
	{
		 nlapiLogExecution('DEBUG', 'Error Process Consignment Purchase/Return', ex.toString());
	}

}


function processPurchaseOrReturn(type,purchaseOrReturnId,soItemIdx,vendorId,purchaseTranExternalId)
{
	 var responseObj = new Object();
	 
	try
	{
		var purchaseOrReturnRecord;
		var ItemTranDate;
		
        if (purchaseOrReturnId==null)
        {
        	purchaseOrReturnRecord = nlapiCreateRecord(type, {recordmode: 'dynamic'});
        	purchaseOrReturnRecord.setFieldValue('entity', vendorId);
        	purchaseOrReturnRecord.setFieldValue('tranid', purchaseTranExternalId);
        	purchaseOrReturnRecord.setFieldValue('trandate', getLastDay(globalValues.salesOrder.getFieldValue('trandate')));
        	
        }
        else
        {//update
        	purchaseOrReturnRecord = nlapiLoadRecord(type, purchaseOrReturnId, {recordmode: 'dynamic'});
        }
             
		var itemId = checkBlankOrNull( globalValues.salesOrder.getLineItemValue('item','item', soItemIdx),0);
		var locationId = checkBlankOrNull(globalValues.salesOrder.getLineItemValue('item','location', soItemIdx),0);
		var quantity = checkBlankOrNull(globalValues.salesOrder.getLineItemValue('item','quantity', soItemIdx),0);
		//var consignmentPrice = checkBlankOrNull(globalValues.salesOrder.getLineItemValue('item',LAZADA_CONSIGNMENT.ColumnName.CONSIGNMENT_PRICE, soItemIdx),0);
		
		
		var omsUid = checkBlankOrNull(globalValues.salesOrder.getLineItemValue('item',LAZADA_CONSIGNMENT.ColumnName.OMS_UID, soItemIdx),0);
		var poiOmsRef = checkBlankOrNull(globalValues.salesOrder.getLineItemValue('item',LAZADA_CONSIGNMENT.ColumnName.POI_REF, soItemIdx),0);
		var bobId = checkBlankOrNull(globalValues.salesOrder.getLineItemValue('item',JLD_Transaction.ColumnName.BOB_ID, soItemIdx),0);
		
		purchaseOrReturnRecord.setFieldValue(LAZADA_CONSIGNMENT.FieldName.CONSIGNMENT_SALES_PO, 'T');
		
		if(type == LAZADA_CONSIGNMENT.Constant.CONSIGNMENT_PURCHASE_ORDER)
		{
			ItemTranDate = checkBlankOrNull(globalValues.salesOrder.getLineItemValue('item',JLD_Transaction.ColumnName.SHIP_DATE, soItemIdx),0);
		}
		else
		{
			ItemTranDate = checkBlankOrNull(globalValues.salesOrder.getLineItemValue('item',JLD_Transaction.ColumnName.REFUND_DATE, soItemIdx),0);
		}
		
		/********************** item Sublist Begin *****************************/
		purchaseOrReturnRecord.insertLineItem('item', 1);
		purchaseOrReturnRecord.setCurrentLineItemValue('item', 'item', itemId);
		purchaseOrReturnRecord.setCurrentLineItemValue('item', 'quantity', quantity);
		purchaseOrReturnRecord.setCurrentLineItemValue('item', 'rate', globalConsignmentCost);
		

		var obj = new Object();
        obj.type = "li";//li for line item field
        obj.internalid = LAZADA_CONSIGNMENT.ColumnName.CONSIGNMENT_PRICE;
        obj.lineNumber = soItemIdx;
        obj.value = globalConsignmentCost;
        obj.sublist = "item";
        newSalesorderArray.push(obj);
		
		purchaseOrReturnRecord.setCurrentLineItemValue('item', LAZADA_CONSIGNMENT.ColumnName.OMS_UID, omsUid);
		purchaseOrReturnRecord.setCurrentLineItemValue('item', LAZADA_CONSIGNMENT.ColumnName.POI_REF, poiOmsRef);
		purchaseOrReturnRecord.setCurrentLineItemValue('item', LAZADA_CONSIGNMENT.ColumnName.SO_BILL_REF, globalValues.salesOrder.id);
		purchaseOrReturnRecord.setCurrentLineItemValue('item', JLD_Transaction.ColumnName.BOB_ID, bobId);
		purchaseOrReturnRecord.setCurrentLineItemValue('item', 'location', locationId);
		
		if(type == LAZADA_CONSIGNMENT.Constant.CONSIGNMENT_PURCHASE_ORDER)
		{
			purchaseOrReturnRecord.setCurrentLineItemValue('item', 'custcol_poi_receipt_date', ItemTranDate);
		}
		else
		{
			purchaseOrReturnRecord.setCurrentLineItemValue('item', 'custcol_vri_consignment_return_date', ItemTranDate);
		}
	
		
		purchaseOrReturnRecord.setCurrentLineItemValue('item', 'custcol_4601_witaxapplies', 'T');
		
		var withHoldingTaxCode = getWithHoldingTax(itemId,vendorId,LAZADA_CONSIGNMENT.WithHoldingTax.ON_PURCHASE);
		purchaseOrReturnRecord.setCurrentLineItemValue('item', 'custcol_4601_witaxcode', withHoldingTaxCode);
		purchaseOrReturnRecord.commitLineItem('item');

		
		/********************** item Sublist End *****************************/
		
	
		///********************** Expense Sublist Begin *****************************/
		/*
		billOrCreditRecord.insertLineItem('expense', 1);
		billOrCreditRecord.setCurrentLineItemValue('expense', 'account', LAZADA_CONSIGNMENT.Constant.EXPENSE_ACCOUNT_ID); 
		billOrCreditRecord.setCurrentLineItemValue('expense', 'amount',  consignmentPrice);
		billOrCreditRecord.setCurrentLineItemValue('expense', 'location', locationId);
		
		billOrCreditRecord.setCurrentLineItemValue('expense', LAZADA_CONSIGNMENT.ColumnName.OMS_UID,  omsUid);
		billOrCreditRecord.setCurrentLineItemValue('expense', LAZADA_CONSIGNMENT.ColumnName.POI_REF, poiOmsRef);  	
		
		billOrCreditRecord.setCurrentLineItemValue('expense', LAZADA_CONSIGNMENT.ColumnName.SO_BILL_REF, recordId);
		billOrCreditRecord.setCurrentLineItemValue('expense', JLD_Transaction.ColumnName.BOB_ID, bobId);
		billOrCreditRecord.setCurrentLineItemValue('expense', 'taxcode', billOrCreditRecord.getLineItemValue('item','taxcode',1));
		
		billOrCreditRecord.setCurrentLineItemValue('expense', 'custcol_4601_witaxapplies', billOrCreditRecord.getLineItemValue('item','custcol_4601_witaxapplies',1));
		billOrCreditRecord.setCurrentLineItemValue('expense', 'custcol_4601_witaxcode_exp',withHoldingTaxCode);	
		billOrCreditRecord.commitLineItem('expense');
		*/
		//********************** Expense Sublist End *****************************/

		try
	    {
			var purchaseOrReturnInternalId = nlapiSubmitRecord(purchaseOrReturnRecord);
			responseObj.purchaseOrReturnInternalId = purchaseOrReturnInternalId;
			responseObj.status = true;
	    }
		catch(ex)
		{
			 nlapiLogExecution( 'ERROR', 'error in submit consignment PO/RETURN', ex.toString());
			 responseObj.status = false;
		}

	}
	catch(ex)
	{
		 nlapiLogExecution('DEBUG', 'Error in Create/Update consignment PO/RETURN', ex.toString());
	}

	return responseObj;
}


function processVendorReturnTransformation(type,soItemIdx)
{
	 var responseObj = new Object();
	 responseObj.status = false;
	 var vendorReturnObj;
	 
	try
	{
		var poInternalId =  globalValues.salesOrder.getLineItemValue('item', LAZADA_CONSIGNMENT.ColumnName.CONSIGNMENT_PO_REF, soItemIdx);
		var soiOmsRef =  globalValues.salesOrder.getLineItemValue('item', LAZADA_CONSIGNMENT.ColumnName.POI_REF, soItemIdx);
		var bobId =  globalValues.salesOrder.getLineItemValue('item',JLD_Transaction.ColumnName.BOB_ID, soItemIdx);
		 var returnedOn = convertDateFormat(globalValues.salesOrder.getFieldValue('trandate'),(globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.RETURNED_ON, soItemIdx)));
		
		 var tranformedItemIdx = null;
		 var isItemTransformed = false;
		 
		if(checkBlankOrNull(poInternalId,0)!= LAZADA_CONSIGNMENT.Constant.ZERO)
		{
			vendorReturnObj = nlapiTransformRecord(LAZADA_CONSIGNMENT.Constant.CONSIGNMENT_PURCHASE_ORDER, poInternalId, LAZADA_CONSIGNMENT.Constant.CONSIGNMENT_VENDOR_RETURN);
			var virCount = vendorReturnObj.getLineItemCount('item');
			
			for(var vretIdx=1; vretIdx <= virCount; vretIdx++)
			{
				var vendorOmsRef = vendorReturnObj.getLineItemValue('item', LAZADA_CONSIGNMENT.ColumnName.POI_REF, vretIdx);
				
				if(soiOmsRef!= vendorOmsRef)
		        {
					vendorReturnObj.removeLineItem('item', vretIdx);
					vretIdx--;
					virCount--;
		        } 
				
				//set vendor return date in line item
				if(soiOmsRef== vendorOmsRef)
		        {
					tranformedItemIdx = vretIdx;
					isItemTransformed = true;
		        }
				
			}
			
			 vendorReturnObj.setFieldValue(LAZADA_CONSIGNMENT.FieldName.CONSIGNMENT_SALES_PO, 'T');
			 var transId = getSubsidiaryPrefix() + "CVR_" + bobId;
			 vendorReturnObj.setFieldValue('tranid', transId);
			 vendorReturnObj.setFieldValue('trandate', returnedOn);
			 
			 if(isItemTransformed == true)
			{
				 var consItemReturnedOn = globalValues.salesOrder.getLineItemValue('item', JLD_Transaction.ColumnName.RETURNED_ON, soItemIdx);
				 vendorReturnObj.setLineItemValue('item', 'custcol_vri_consignment_return_date', tranformedItemIdx,consItemReturnedOn);
			}
			
			 try
			 {
				  var vendorReturnId = nlapiSubmitRecord(vendorReturnObj);
				   responseObj.vendorReturnId = vendorReturnId;
				   responseObj.status = true;
				}
				catch(ex)
				{
					 nlapiLogExecution( 'ERROR', 'error in submit consignment RETURN', ex.toString());
					 responseObj.status = false;
				}
			
		}
		
	}
	catch(ex)
	{
		 nlapiLogExecution('DEBUG', 'Error in Process Vendor Return Transformation', ex.toString());
		 responseObj.status = false;
		
	}
	
	return responseObj;
}

function getCurrentMonthAdjustInvenotoryId()
{
	
	try
	{
		var currentMonthInvAdjId = getSubsidiaryPrefix() + 'CINVA_' +  getCurrentMonthYear(globalValues.salesOrder.getFieldValue('trandate'));
		return currentMonthInvAdjId;
		
	}
	catch(ex)
	{
		 nlapiLogExecution('DEBUG', 'Error in Current Month Bill', ex.toString());
	}
}

function getCurrentMonthPurchase(tranprefixType,vendorExtId,tranDate)
{
	try
	{
		var currentMonthPurchase = getSubsidiaryPrefix() + tranprefixType + vendorExtId.replace(getSubsidiaryPrefix(), "") + '_' +  getCurrentMonthYear(tranDate);
		return currentMonthPurchase;
		
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

function getConsignmentReturnDate(returnDate)
{	
	try
	{
		var dateString = returnDate.toString();
		var dateReplace = dateString.replace(" ", "/");
		var splitDate = dateReplace.split("/");
		
		return splitDate[0] + "_" + (splitDate[1]) + "_" + splitDate[2] ;
		
	}
	catch(ex)
	{
		 nlapiLogExecution('DEBUG', 'Error in Current Month and Year', ex.toString());
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

function searchPoProcessingId(recorType, tranId, vendorId)
{
	var filters = new Array();
		if(vendorId == null)
		{
			filters[0] = new nlobjSearchFilter( 'tranid', null, 'is', tranId);
			filters[1] = new nlobjSearchFilter( 'mainline', null, 'is', 'T' );
			
		}
		else
		{
			filters[0] = new nlobjSearchFilter( 'tranid', null, 'is', tranId);
			filters[1] = new nlobjSearchFilter('entity', null, 'anyof', vendorId);
			filters[2] = new nlobjSearchFilter( 'mainline', null, 'is', 'T' );
		}
		
		
		var InternalIdColumn =new Array();
		InternalIdColumn[0] = new nlobjSearchColumn ("internalid");
		var searchresults = nlapiSearchRecord(recorType, null, filters, InternalIdColumn);
	
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

//Adjust Inventory
function adjustConsignmentInventory(soItemIdx) 
{
	
	try
	{
		var itemId = checkBlankOrNull( globalValues.salesOrder.getLineItemValue('item','item', soItemIdx),0);
		var locationId = checkBlankOrNull(globalValues.salesOrder.getLineItemValue('item','location', soItemIdx),0);
		
		globalValues.adjsutInventory.setFieldValue('subsidiary', globalValues.salesOrder.getFieldValue('subsidiary'));
		globalValues.adjsutInventory.setFieldValue('account', LAZADA_CONSIGNMENT.Constant.EXPENSE_ACCOUNT_ID);
		
		globalValues.adjsutInventory.insertLineItem('inventory', 1);
		globalValues.adjsutInventory.setCurrentLineItemValue('inventory', 'item', itemId);
		globalValues.adjsutInventory.setCurrentLineItemValue('inventory', 'location', locationId);
		globalValues.adjsutInventory.setCurrentLineItemValue('inventory', 'adjustqtyby', -1);
		globalValues.adjsutInventory.commitLineItem('inventory');
		
		return true;
	}
	catch(ex)
    {
	    nlapiLogExecution('DEBUG', 'Error In Adjust Inventory', ex.toString());
	    
	    return false;
	 }
		
	//inventoryadjustment
}

//Function to Convert Date Time to Date Format
function convertDateFormat(defaultDateParam,dateParam)
{
	try
	{
		if ((dateParam ==null) ||( dateParam==''))
		{
			return defaultDateParam;
		}
		else
		{
			var dateString = dateParam.toString();
			var dateReplace = dateString.replace(" ", "/");
			var dateSplit = dateReplace.split("/");
			
			var date = dateSplit[0];
			var month = dateSplit[1];
			var year = dateSplit[2];
			
		     dateFormat = date+'/'+month+'/'+year;
		     
		     return dateFormat;
		}
	}
	 catch(ex)
	 {
		 nlapiLogExecution('DEBUG', 'Error In Convert Date Format', ex.toString());
	 }
}



