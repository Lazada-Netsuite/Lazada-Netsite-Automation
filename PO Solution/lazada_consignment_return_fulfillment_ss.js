
/*
 * 
 * Auhors: Mohammed Zubair Ahmed & Kalyan Josyula
 * 
   Date : 1st November 2013
   
  Module Description : Process Consignment Return Process
   */


var ItemFulfillment_Uid_GlobalArray = [];
var globalValues = new Object();
var itemFound = false;

function ProcessConsignmentReturns()
{
	try {	
		
			var pendingVendorReturns = getPendingVendorReturns();
		
			for(var vrIdx = 0; vrIdx < pendingVendorReturns.length; vrIdx ++)
			{
				 globalValues.vendorReturnRecord = nlapiLoadRecord(LAZADA_CONSIGNMENT.Constant.CONSIGNMENT_VENDOR_RETURN, pendingVendorReturns[vrIdx].id);
				var vrStatus = globalValues.vendorReturnRecord.getFieldValue('status');
				
				if(vrStatus == LAZADA_CONSIGNMENT.Constant.PENDING_RETURN || vrStatus.search(LAZADA_CONSIGNMENT.Constant.PARTIALLY_RETURN) != -1 ) 
				{ 
						processConsignmentVendorReturns();
				}
				
			}
		}
		catch(ex){
		
			 nlapiLogExecution('DEBUG', 'Error In Process Consignment Return', ex.toString());

		}

}
	
	
function getPendingVendorReturns()
{	
	var vrResults = [];
    var savedsearch = nlapiLoadSearch('vendorreturnauthorization', 'customsearch_consignment_vendor_return');
    var vrResultset = savedsearch.runSearch();
    var searchid = 0;
    do {
        var vrResultslice = vrResultset.getResults(searchid, searchid+1000 );
        for (var rs in vrResultslice) {
        	vrResults.push( vrResultslice[rs] );
            searchid++;
        }
    } while (vrResults.length >= 1000);
    return vrResults;

}	


function processConsignmentVendorReturns()
{
	var vrItemCount = globalValues.vendorReturnRecord.getLineItemCount('item');
	
	for(var vrItemIdx = 1; vrItemIdx <= vrItemCount; vrItemIdx ++)
	{
			var vriReceiptDate = convertDateFormat(globalValues.vendorReturnRecord.getLineItemValue('item', LAZADA_CONSIGNMENT.ColumnName.CONSIGNMENT_RETURN_DATE, vrItemIdx));
			var vriQuantity    =  checkBlankOrNull(globalValues.vendorReturnRecord.getLineItemValue('item', 'quantity', vrItemIdx),0);
			
			if(vriReceiptDate == null)
			{
				continue;
			}
		
			 var vriReceiptId = checkBlankOrNull(globalValues.vendorReturnRecord.getLineItemValue('item',LAZADA_CONSIGNMENT.ColumnName.CONSIGNMENT_RETURN_IF_ID, vrItemIdx),0);
			 var objItemFulfillRecord;
			 var transactionId = '';
			 var setItemReceiptLine = false;
			 var itemFulfillmentCreatedId;
			 
			 try
			 {
			
				 if (vriReceiptId== LAZADA_CONSIGNMENT.Constant.ZERO)
				  {
					 objItemFulfillRecord = nlapiTransformRecord(LAZADA_CONSIGNMENT.Constant.CONSIGNMENT_VENDOR_RETURN,globalValues.vendorReturnRecord.id,LAZADA_CONSIGNMENT.Constant.CONSIGNMENT_ITEM_FULFILLMENT);
					 
				  }
				 else
				 {
					 objItemFulfillRecord = nlapiLoadRecord(LAZADA_CONSIGNMENT.Constant.CONSIGNMENT_ITEM_FULFILLMENT,vriReceiptId);
				 } 
				 
				 objItemFulfillRecord.setFieldValue('trandate', vriReceiptDate);
				 var ifCount = objItemFulfillRecord.getLineItemCount('item');
				  var ItemFulfillment_Uid_Array = [];
				  
						 
					for(var ifIdx = 1; ifIdx <= ifCount; ifIdx ++)
					{
						  var ifReceiptDate = objItemFulfillRecord.getLineItemValue('item',LAZADA_CONSIGNMENT.ColumnName.CONSIGNMENT_RETURN_DATE, ifIdx);
						   var vriUidRef = objItemFulfillRecord.getLineItemValue('item', LAZADA_CONSIGNMENT.ColumnName.POI_REF, ifIdx);
						  
							 if(convertDateFormat(vriReceiptDate) == convertDateFormat(ifReceiptDate))
							 {
								 objItemFulfillRecord.setLineItemValue('item', 'quantity', ifIdx, vriQuantity);
								 var vriUidRefObject=new Object();
								 vriUidRefObject.subListRef= vriUidRef;
								 ItemFulfillment_Uid_Array.push(vriUidRefObject);
								 setItemReceiptLine = true;
								 transactionId = getItemFulfillmentTransactionId(ifReceiptDate);
							 }
							 else
							{
								 objItemFulfillRecord.setLineItemValue('item', 'itemreceive', ifIdx, 'F');
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
					    objItemFulfillRecord.setFieldValue('tranid', transactionId);
					    itemFulfillmentCreatedId = nlapiSubmitRecord(objItemFulfillRecord, true, true);
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
			 
			 SetItemFulfillmentRefforVendorReturn(itemFulfillmentCreatedId,ItemFulfillment_Uid_Array);

	}
	
	
	var uidLength = ItemFulfillment_Uid_GlobalArray.length;
	if(uidLength != LAZADA_CONSIGNMENT.Constant.ZERO)
	{
		//Function call to update Item Receipt in purchase Order Record
		updateItemFulfillementInVendorReturn(ItemFulfillment_Uid_GlobalArray);
		
	}

}

//set Item receipt reference number on purchase  order
function SetItemFulfillmentRefforVendorReturn(itemFulfillmentCreatedId,ItemFulfillment_Uid_Array)
{
	try
	{
	
		for (var i=0;i<ItemFulfillment_Uid_Array.length;i++)
		{
			ItemFulfillment_Uid_Array[i].itemFulfillmentId = itemFulfillmentCreatedId;
			 
		}
		
		ItemFulfillment_Uid_GlobalArray.push(ItemFulfillment_Uid_Array);
  }
	catch(ex)
	 {
		 nlapiLogExecution('DEBUG', 'Error In Set Item Reference for Purchase', ex.toString());
	 }
} 


function getItemFulfillmentTransactionId(ifReceiptDate)
{
	try
	{
	
		var ifReceiptTran = getSubsidiaryPrefix() + "CVRIF_" + globalValues.vendorReturnRecord.getFieldText('entity').replace(/ /g, "_") + "_" + globalValues.vendorReturnRecord.id + "_" + getCurrentItemFulfillmentDate(ifReceiptDate);
		
		return  ifReceiptTran;
	}
	catch(ex)
	{
		 nlapiLogExecution('DEBUG', 'Error in Item Fulfillment transaction ID', ex.toString());
	}

}


//Update Created Item Receipt Id In purchase Order
function updateItemFulfillementInVendorReturn(ItemFulfillment_Uid_GlobalArray)
{
	try
	{
		
	  var venRetUpdate = nlapiLoadRecord(globalValues.vendorReturnRecord.recordType, globalValues.vendorReturnRecord.id);
	   
		for(var Irdx = 0; Irdx < ItemFulfillment_Uid_GlobalArray.length; Irdx ++)
		{
			var itemFulfillmentUidArray = ItemFulfillment_Uid_GlobalArray[Irdx];
			
			//nlapiLogExecution('DEBUG', 'itemReceiptUidArray', JSON.stringify(itemFulfillmentUidArray));
			
			for(var uidIdx = 0; uidIdx < itemFulfillmentUidArray.length; uidIdx ++)
			{
				 itemFound = false;
				var lineRef = FindLineItemNumber(venRetUpdate,'item', LAZADA_CONSIGNMENT.ColumnName.POI_REF ,itemFulfillmentUidArray[uidIdx].subListRef);
				
				nlapiLogExecution('DEBUG', 'lineRef', lineRef);
				
				if(itemFound == true)
				{
					venRetUpdate.setLineItemValue('item',LAZADA_CONSIGNMENT.ColumnName.CONSIGNMENT_RETURN_IF_ID,lineRef,itemFulfillmentUidArray[uidIdx].itemFulfillmentId);
				}
			}
		}
	
	     nlapiSubmitRecord(venRetUpdate);
		 
		}
		 catch(ex)
		 {
			 nlapiLogExecution('DEBUG', 'Error in Update Item Receipt in PO', ex.toString() );
		 }

}


function getCurrentItemFulfillmentDate(ifReceiptDate)
{	
	try
	{
		var dateString = ifReceiptDate.toString();
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
		var prefix = checkBlankOrNull(globalValues.vendorReturnRecord.getFieldValue('tranid'),0);
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
		var subListCount = globalValues.vendorReturnRecord.getLineItemCount(sublistRef);
		
		for(var Idx = 1; Idx <= subListCount; Idx++)
		{
			
			var fieldValue = globalValues.vendorReturnRecord.getLineItemValue(sublistRef,fieldRef,Idx);	
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
