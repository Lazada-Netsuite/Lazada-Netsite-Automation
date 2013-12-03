function popUpBillDetails(elementId)
{
	
	var recordId = "po_Id_" +  elementId;
	var documentId = "document_Image_"  +  elementId;
	var recordValue = document.getElementById(recordId).innerHTML;
	var documentUrl = document.getElementById(documentId).innerHTML;
	
	var invoiceUrl = "https://system.sandbox.netsuite.com/app/accounting/transactions/vendbill.nl?transform=purchord&whence=&id="+recordValue+"&e=T&memdoc=0";
	
	
	$('#myIframe').attr('src',invoiceUrl);
    $('#myIframe1').attr('src',documentUrl);
    $("#dialog").show();
    $("#dialog").dialog({width:1250, height:500});
    return false;
}

	
	//alert(invoiceUrl);
	//var invoiceWindow = window.open(invoiceUrl, 'Netsuite Invoice', 'width=400,height=400,resizeable,scrollbars');
//	
//	var documentWindow =  window.open(documentUrl, 'Document Image', 'width=400,height=400,resizeable,scrollbars');
//	
	//invoiceWindow.document.close();
//	
//	documentWindow.document.close();

