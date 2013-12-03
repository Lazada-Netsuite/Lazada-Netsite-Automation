/*
 * 
 * Auhors: Mohammed Zubair Ahmed & Kalyan Josyula
 * 
   Date : 31 Oct 2013
   
  Module Description : Process Consignment Delivery Receipt
   */


var ItemReciept_Uid_GlobalArray = [];
var globalValues = new Object();
var itemFound = false;

function processConignmentItemReceipts()
{

	try {	
			var openPurchaseOrders = getOpenPurchaseOrders();
			
			for(var poId = 0; poId < openPurchaseOrders.length; poId ++)
			{
				globalValues.purchaseOrder = nlapiLoadRecord(LAZADA_CONSIGNMENT.Constant.CONSIGNMENT_PURCHASE_ORDER, openPurchaseOrders[poId].id);
				var poStatus = globalValues.purchaseOrder.getFieldValue('status');
				
				if(poStatus == LAZADA_CONSIGNMENT.Constant.PENDING_RECEIPT || poStatus.search(LAZADA_CONSIGNMENT.Constant.PARTIALLY_RECEIVED) != -1 ) 
				{ 
						processConsignmentItemReceipts();
				}
			}
		}

		catch(ex){
	
			 nlapiLogExecution('DEBUG', 'Error In Process Consignment Item Receipt', ex.toString());

			}
}


function getOpenPurchaseOrders()
{
	try
	{
		var poResults = [];
	    var savedsearch = nlapiLoadSearch(LAZADA_CONSIGNMENT.Constant.CONSIGNMENT_PURCHASE_ORDER, LAZADA_CONSIGNMENT.Constant.CONSIGNMENT_DELIVERY_RECEIPT);
	    var poResultset = savedsearch.runSearch();
	    var searchid = 0;
	    do {
	        var poResultslice = poResultset.getResults(searchid, searchid+1000 );
	        for (var rs in poResultslice) {
	        	poResults.push( poResultslice[rs] );
	            searchid++;
	        }
	    } while (poResultslice.length >= 1000);
	    return poResults;
	}
	catch(ex){
		
		 nlapiLogExecution('DEBUG', 'Error In Get Open Purchase Orders', ex.toString());

		}
}


function processConsignmentItemReceipts()
{
	var poItemCount = globalValues.purchaseOrder.getLineItemCount('item');
	
	for(var poItemIdx = 1; poItemIdx <= poItemCount; poItemIdx ++)
	{
		   var poiReceiptDate = convertDateFormat(globalValues.purchaseOrder.getLineItemValue('item', LAZADA_CONSIGNMENT.ColumnName.CONSIGNMENT_RECEIPT_DATE, poItemIdx));
			
			if(poiReceiptDate == null)
			{
				continue;
			}
			
			var poiQtyReceived = checkBlankOrNull(globalValues.purchaseOrder.getLineItemValue('item', 'quantityreceived', poItemIdx),0);
			var poiQuantity    =  checkBlankOrNull(globalValues.purchaseOrder.getLineItemValue('item', 'quantity', poItemIdx),0);
			
			if(poiQuantity == poiQtyReceived)
			{
				continue;
			}
			
			 var poiReceiptId = checkBlankOrNull(globalValues.purchaseOrder.getLineItemValue('item',LAZADA_CONSIGNMENT.ColumnName.CONSIGNMENT_RECEIPT_IR_ID, poItemIdx),0);
			 var objItemReciptRecord;
			 var transactionId = '';
			 var setItemReceiptLine = false;
			 var itemReceiptCreatedId;
			 
			 try
			 {
			 
				 if (poiReceiptId== LAZADA_CONSIGNMENT.Constant.ZERO)
				  {
					 objItemReciptRecord = nlapiTransformRecord(LAZADA_CONSIGNMENT.Constant.CONSIGNMENT_PURCHASE_ORDER,globalValues.purchaseOrder.id,LAZADA_CONSIGNMENT.Constant.CONSIGNMENT_ITEM_RECEIPT);
				  }
				 else
				 {
					 objItemReciptRecord = nlapiLoadRecord(LAZADA_CONSIGNMENT.Constant.CONSIGNMENT_ITEM_RECEIPT,poiReceiptId);
				 } 
				 
				 objItemReciptRecord.setFieldValue('trandate', poiReceiptDate);
				 var irCount = objItemReciptRecord.getLineItemCount('item');
				  var ItemReciept_Uid_Array = [];
				  
						 
					for(var irIdx = 1; irIdx <= irCount; irIdx ++)
					{
						  var irItemId = objItemReciptRecord.getLineItemValue('item', 'item', irIdx);
						  var irReceiptDate = objItemReciptRecord.getLineItemValue('item', LAZADA_CONSIGNMENT.ColumnName.CONSIGNMENT_RECEIPT_DATE, irIdx);
						 var poiUidRef = objItemReciptRecord.getLineItemValue('item', LAZADA_CONSIGNMENT.ColumnName.POI_REF, irIdx);
						  
							 if(convertDateFormat(poiReceiptDate) == convertDateFormat(irReceiptDate))
							 {
								 objItemReciptRecord.setLineItemValue('item', 'quantity', irIdx, poiQuantity);
								 var poiUidRefObject=new Object();
								 poiUidRefObject.subListRef= poiUidRef;
								 ItemReciept_Uid_Array.push(poiUidRefObject);
								 setItemReceiptLine = true;
								 transactionId = getItemReceiptTransactionId(irReceiptDate);
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
			 
			 
			 try
			 {
				 if(setItemReceiptLine == true)
					{
						objItemReciptRecord.setFieldValue('tranid', transactionId);
						 itemReceiptCreatedId = nlapiSubmitRecord(objItemReciptRecord, true, true);
					}
					else
					{
						continue;
					}
				 
			 }
			 catch(Ex)
			 {
				 
				 nlapiLogExecution('DEBUG', 'Error In Submit reccord', ex.toString());
			 }
			 
			 SetItemReceiptRefforPurchase(itemReceiptCreatedId,ItemReciept_Uid_Array);

	}
	
	var uidLength = ItemReciept_Uid_GlobalArray.length;
	if(uidLength != LAZADA_CONSIGNMENT.Constant.ZERO)
	{
		updateItemReceiptInPO(ItemReciept_Uid_GlobalArray);
		
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


function getItemReceiptTransactionId(irReceiptDate)
{
	try
	{
		var iterReceiptTran = getSubsidiaryPrefix() + "CDR_" + globalValues.purchaseOrder.getFieldText('entity').replace(/ /g, "_") + "_" + globalValues.purchaseOrder.id + "_" + getCurrentItemReceiptDate(irReceiptDate);
		return  iterReceiptTran;
	}
	catch(ex)
	{
		 nlapiLogExecution('DEBUG', 'Error in Item receipt transaction ID', ex.toString());
	}

}


//Update Created Item Receipt Id In purchase Order
function updateItemReceiptInPO(ItemReciept_Uid_GlobalArray)
{
	try
	{
		 var poUpdate = nlapiLoadRecord(globalValues.purchaseOrder.recordType, globalValues.purchaseOrder.id);
	   
		for(var Irdx = 0; Irdx < ItemReciept_Uid_GlobalArray.length; Irdx ++)
		{
			var itemReceiptUidArray = ItemReciept_Uid_GlobalArray[Irdx];
			
			for(var uidIdx = 0; uidIdx < itemReceiptUidArray.length; uidIdx ++)
			{
				 itemFound = false;
				var lineRef = FindLineItemNumber(poUpdate,'item', LAZADA_CONSIGNMENT.ColumnName.POI_REF ,itemReceiptUidArray[uidIdx].subListRef);
				
				if(itemFound == true)
				{
					poUpdate.setLineItemValue('item',LAZADA_CONSIGNMENT.ColumnName.CONSIGNMENT_RECEIPT_IR_ID,lineRef,itemReceiptUidArray[uidIdx].itemReceiptId);
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


function getCurrentItemReceiptDate(irReceiptDate)
{	
	try
	{
		var dateString = irReceiptDate.toString();
		var dateReplace = dateString.replace(" ", "/");
		var splitDate = dateReplace.split("/");
		
		return splitDate[0] + "_" + (splitDate[1]) + "_" + splitDate[2] ;
		
	}
	catch(ex)
	{
		 nlapiLogExecution('DEBUG', 'Error in Current Month and Year', ex.toString());
	}

}

function getSubsidiaryPrefix()
{
	try
	{
		var prefix = checkBlankOrNull(globalValues.purchaseOrder.getFieldValue('tranid'),0);
		var transactionPrefix = prefix.split('_');
	    return transactionPrefix[0] + '_';

	}
	catch(ex)
	{
		 nlapiLogExecution('DEBUG', 'Error in subsidiary Preix', ex.toString());
	}

}


//Function to Convert Date Time to Date Format
function convertDateFormat(dateParam)
{
	try
	{
		if ((dateParam ==null) ||( dateParam==''))
		{
			return null;
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

//Function to Find Line Item Number In Sublist
function FindLineItemNumber(poUpdate,sublistRef,fieldRef,paramValue)
{
	try
	{
		var subListCount = globalValues.purchaseOrder.getLineItemCount(sublistRef);
		
		for(var Idx = 1; Idx <= subListCount; Idx++)
		{
			
			var fieldValue = globalValues.purchaseOrder.getLineItemValue(sublistRef,fieldRef,Idx);	
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
