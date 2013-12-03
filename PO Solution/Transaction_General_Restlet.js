
function getTransactionDetails(salesOrder)
{
//	 var arrSearchColumn = new Array();
//	 
//	 arrSearchColumn[0] = new nlobjSearchColumn('custrecord_app_invoice_po_id');
//	 arrSearchColumn[1] = new nlobjSearchColumn('custrecord_app_invoice_doc_url');
//	 arrSearchColumn[2] = new nlobjSearchColumn('custrecord_app_invoice_status'); 
//	 arrSearchColumn[3] = new nlobjSearchColumn('id');
//	 
//	 var invoiceAprovalSearch = nlapiSearchRecord('customrecord_approved_invoice','customsearch_app_invoice_queue',null,arrSearchColumn);
//	 
//	 return invoiceAprovalSearch;
	 
	var  journalDetails = nlapiLoadRecord('journalentry', 15024);
	

	
	var sublistCNT = journalDetails.getLineItemCount('links');
	
	var line1 = journalDetails.getLineItemValue('links', 'total', 1);
	
	
	return line1;
	
	
	var line1 = journalDetails.setLineItemValue('links', 'total', 2, 450);
	
	var intId = nlapiSubmitRecord(journalDetails);
	return intId;
	
}

