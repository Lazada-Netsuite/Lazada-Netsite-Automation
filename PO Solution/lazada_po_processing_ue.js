/*
 * 
 * Auhors: Mohammed & Kalyan
 * 
   Date : 20th Oct 2013
   
  Module Description : Purchase Order
  This module  has been designed to avoid Manual proccess of accounant of uploading PO's
  Purchase order flow from OMS TO Netsuite using Integration engine
  After creating purchase orders based on few criteria, it will create item receipts
  
 */

var purchaseRecord = '';
var ItemReciept_Uid_GlobalArray = [];
var itemFound = false;

//Main function to create Item receipt after submit purchase order
function CreateItemReceiptForPurchaseOrder(record)
{
	try
	{
			if(type == LAZADA_Netsuite_Constant.OPERATION_TYPE.CREATE || type == LAZADA_Netsuite_Constant.OPERATION_TYPE.EDIT)
			{
				var recordId = nlapiGetRecordId();
				var recordType = nlapiGetRecordType();
				purchaseRecord = nlapiLoadRecord(recordType, recordId);
				
				processItemReceiptRecord(purchaseRecord,recordType,recordId);
			}
	}
	catch(ex)
	{
		return ex.message;
	}
}

//Function create item receipt record based on various criteria
function processItemReceiptRecord(purchaseRecord,recordType,recordId)
{
	var autoPo = purchaseRecord.getFieldValue(LAZADA_PO_TRANS.FieldName.AUTO_PO);
	
	if(autoPo == LAZADA_PO_TRANS.FieldName.FALSE_FLAG)
	{
		return;
	}

	var poStatus = purchaseRecord.getFieldValue('status');
	var tranDate = purchaseRecord.getFieldValue('trandate');
	//var poTranId = purchaseRecord.getFieldValue('tranid');

	if(poStatus == LAZADA_Netsuite_Constant.PO_Status.PENDING_RECEIPT || poStatus.search(LAZADA_Netsuite_Constant.PO_Status.PARTIALLY_RECEIVED) != -1 ) 
	{ 
		//Get purchase order Line item count to create item receipt
		var poItemCount = purchaseRecord.getLineItemCount('item');
	
		for(var poItemIdx = 1; poItemIdx <= poItemCount; poItemIdx ++)
		{
			
			var poiReceiptDate = convertDateFormat(tranDate,purchaseRecord.getLineItemValue('item', LAZADA_PO_TRANS.ColumnName.RECEIPT_DATE, poItemIdx));	
			//var poiType =  checkBlankOrNull(purchaseRecord.getLineItemValue('item', 'itemtype', poItemIdx),0);
			var poiQtyReceived = checkBlankOrNull(purchaseRecord.getLineItemValue('item', 'quantityreceived', poItemIdx),0);
			var poiQuantity    =  checkBlankOrNull(purchaseRecord.getLineItemValue('item', 'quantity', poItemIdx),0);
		    var poiDeliveryNote = checkBlankOrNull(purchaseRecord.getLineItemValue('item', LAZADA_PO_TRANS.ColumnName.DELIVERY_NOTE, poItemIdx),0);
		    
		    var poiQcStatus = checkBlankOrNull(purchaseRecord.getLineItemValue('item', LAZADA_PO_TRANS.ColumnName.QC_sTATUS, poItemIdx),0);
		    
			if((poiDeliveryNote == null) ||(poiQuantity == poiQtyReceived) || poiQcStatus == LAZADA_Netsuite_Constant.PO_Status.QC_FAILED)
			{
						continue;
			}
							
			 var poiReceiptId = checkBlankOrNull(purchaseRecord.getLineItemValue('item', LAZADA_PO_TRANS.ColumnName.ITEM_RECEIPT_ID, poItemIdx),0);
			 
			 var objItemReciptRecord;
			 var transactionId = '';
			 var setItemReceiptLine = false;
			 try
			 {
			 
				 if (poiReceiptId==0)
				  {
						  objItemReciptRecord = nlapiTransformRecord(recordType,recordId,'itemreceipt');
				  }
				 else
				 {
					  objItemReciptRecord = nlapiLoadRecord('itemreceipt',poiReceiptId);
				 } 
				 
			 		objItemReciptRecord.setFieldValue('trandate', poiReceiptDate);
					 var irCount = objItemReciptRecord.getLineItemCount('item');
					  var ItemReciept_Uid_Array = [];
					  
							 
						for(var irIdx = 1; irIdx <= irCount; irIdx ++)
						{
							
							 var irdeliveryNote = checkBlankOrNull(objItemReciptRecord.getLineItemValue('item', LAZADA_PO_TRANS.ColumnName.DELIVERY_NOTE, irIdx),0);
							  var irItemId = objItemReciptRecord.getLineItemValue('item', 'item', irIdx);
								 var poiUidRef = objItemReciptRecord.getLineItemValue('item', LAZADA_PO_TRANS.ColumnName.OMS_REFERENCE, irIdx);
								 var irQcStatus = objItemReciptRecord.getLineItemValue('item', LAZADA_PO_TRANS.ColumnName.QC_sTATUS, irIdx);	 
								 
								 if(poiDeliveryNote == irdeliveryNote && irQcStatus!= LAZADA_Netsuite_Constant.PO_Status.QC_FAILED)
								 {
									 objItemReciptRecord.setLineItemValue('item', 'quantity', irIdx, poiQuantity);
									 var poiUidRefObject=new Object();
									 poiUidRefObject.subListRef= poiUidRef;
									 ItemReciept_Uid_Array.push(poiUidRefObject);
									 setItemReceiptLine = true;
									 transactionId = poiDeliveryNote;
								 }
								 else
								{
									 
									 objItemReciptRecord.setLineItemValue('item', 'itemreceive', irIdx, 'F');
								 }
						}
						
				 }
				 catch(ex)
				 {
					 nlapiLogExecution('DEBUG', 'Error In Transform Record', ex.toString());
				 }
							
					if(setItemReceiptLine == true)
					{
						objItemReciptRecord.setFieldValue('tranid', transactionId);
						var itemReceiptCreatedId = nlapiSubmitRecord(objItemReciptRecord, true, true);
					}
					else
					{
						continue;
					}
					
					//Function to Set Item Receipt Created id in Array
					SetItemReceiptRefforPurchase(itemReceiptCreatedId,ItemReciept_Uid_Array);
					
			}
	}


	var uidLength = ItemReciept_Uid_GlobalArray.length;
	if(uidLength != 0)
	{
		//Function call to update Item Receipt in purchase Order Record
		updateItemReceiptInPO(ItemReciept_Uid_GlobalArray,recordId,recordType);
		
	}


}

//set Item receipt reference number on purchase  order
function SetItemReceiptRefforPurchase(itemReceiptCreatedId,ItemReciept_Uid_Array)
{
	try
	{
	
		for (var i=0;i<ItemReciept_Uid_Array.length;i++)
		{
			ItemReciept_Uid_Array[i].itemReceiptId = itemReceiptCreatedId;
			 
		}
		
		ItemReciept_Uid_GlobalArray.push(ItemReciept_Uid_Array);
  }
	catch(ex)
	 {
		 nlapiLogExecution('DEBUG', 'Error In Set Item Reference for Purchase', ex.toString());
	 }
} 


//Update Created Item Receipt Id In purchase Order
function updateItemReceiptInPO(ItemReciept_Uid_GlobalArray,recordId,recordType)
{
	try
	{
		var poUpdate = nlapiLoadRecord(recordType, recordId);
	
		for(var Irdx = 0; Irdx < ItemReciept_Uid_GlobalArray.length; Irdx ++)
		{
			var itemReceiptUidArray = ItemReciept_Uid_GlobalArray[Irdx];
			
			for(var uidIdx = 0; uidIdx < itemReceiptUidArray.length; uidIdx ++)
			{
			
				var lineRef = FindLineItemNumber(poUpdate,'item', LAZADA_PO_TRANS.ColumnName.OMS_REFERENCE ,itemReceiptUidArray[uidIdx].subListRef);
				
				if(itemFound == true)
				{
					poUpdate.setLineItemValue('item', LAZADA_PO_TRANS.ColumnName.ITEM_RECEIPT_ID,lineRef,itemReceiptUidArray[uidIdx].itemReceiptId);
				}
			}
		}
	
	      nlapiSubmitRecord(poUpdate);
		 
		}
		 catch(ex)
		 {
			 nlapiLogExecution('DEBUG', 'Error in Update Item Receipt in PO', ex.toString() );
		 }

}


//Function to Find Line Item Number In Sublist
function FindLineItemNumber(poUpdate,sublistRef,fieldRef,paramValue)
{
	try
	{
		var subListCount = poUpdate.getLineItemCount(sublistRef);
		
		for(var Idx = 1; Idx <= subListCount; Idx++)
		{
			
			var fieldValue = poUpdate.getLineItemValue(sublistRef,fieldRef,Idx);	
				if(fieldValue == paramValue)
				{
					itemFound = true;
					return Idx;
	     		}
			
		}
		
		if(itemFound == false)
		{
			
			return itemFound;
		}
	}
	 catch(ex)
	 {
		 nlapiLogExecution('DEBUG', 'Error In Find Line Item Number', ex.toString());
	 }
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

//Function to Get Transaction Prefix
function getTransactionPrefix(stringTranId)
{
	var prefix = stringTranId.split('_');
	
    return prefix[0];
}
