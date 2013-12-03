function demoList(request, response)
{
	 var method = request.getMethod();
	 var something = "";
	 
	 if (method == "POST") 
	 { 
		 something = request.getParameter("something"); 
		 nlapiLogExecution("Debug", "Input Value", something);
		 response.write("Input Value"); 
	 }
	 
	 
	 var arrSearchColumn = new Array();
	 
	 arrSearchColumn[0] = new nlobjSearchColumn('custrecord_app_invoice_po_id');
	 arrSearchColumn[1] = new nlobjSearchColumn('custrecord_app_invoice_doc_url');
	 arrSearchColumn[2] = new nlobjSearchColumn('custrecord_app_invoice_status'); 
	 arrSearchColumn[3] = new nlobjSearchColumn('id');
	 var invoiceAprovalSearch = nlapiSearchRecord('customrecord_approved_invoice','customsearch_app_invoice_queue',null,arrSearchColumn);
	 
	
	 
	 
	 var html = '<html>' + '<head>';
	 		html += '<link type="text/css" href="//ajax.googleapis.com/ajax/libs/jqueryui/1.8.24/themes/ui-darkness/jquery-ui.css" rel="stylesheet">';
	 		html += '<script type="text/javascript" src="//ajax.googleapis.com/ajax/libs/jquery/1.7.2/jquery.min.js"></script>';
	 		html += '<script type="text/javascript" src="//ajax.googleapis.com/ajax/libs/jqueryui/1.8.24/jquery-ui.min.js"></script>';
	 		html += '<script type="text/javascript" src="https://system.sandbox.netsuite.com/core/media/media.nl?id=3308&c=3724161&h=6f7708dd9081f0e43972&mv=hof6koko&_xt=.js"></script>';

	 		html += '</head>' ;
	 			
	 		html += '<body>'; 
		 		html +='<form method="post">';
		 		
		 		/*html += '<div id="dialog" title="Approval Invoices">';
		 		html += '<iframe id="myIframe" src=""></iframe> </br> </br>';
		 		html += '<iframe id="myIframe1" src=""></iframe> </div>'; */
		 		
		 		html += '<table border="1">';
		 		html += '<th> ';
		 		html += '<td> Record Id </td> <td> PO Internal Id </td> <td> PO Number </td>  <td> Document Url</td> <td> Status </td> <td> Process </td>';
		 		html += '</th> ';
		 		
		 	for(var recordIdx = 0; recordIdx < invoiceAprovalSearch.length; recordIdx++)
		 	{
		 		var searchResult = invoiceAprovalSearch[recordIdx];
		 		
		 		var internalId = searchResult.getValue('id');
		 		var poNumber = searchResult.getText('custrecord_app_invoice_po_id'); 
		 		var poId = searchResult.getValue('custrecord_app_invoice_po_id');
		 		var documentUrl = searchResult.getValue('custrecord_app_invoice_doc_url'); 
		 		var status = searchResult.getText('custrecord_app_invoice_status'); ;
	 			var invoice_Index = recordIdx + 1;
		 		
		 		html += '<tr> <td> </td>';
		 		
			 		html +=	'<td id="internal_id_';
			 		html += invoice_Index;
			 		html += '">';
			 		html += internalId;
			 		html += '</td>' ;
			 		
			 		html +=	'<td id="po_Id_';
			 		html += invoice_Index;
			 		html += '">';
			 		html += poId;
			 		html += '</td>' ;
			 		
			 		html +=	'<td id="po_Number_';
			 		html += invoice_Index;
			 		html += '">';
			 		html += poNumber;
			 		html += '</td>' ;
			 	
			 		
			 		html +=	'<td id="document_Image_';
			 		html += invoice_Index;
			 		html += '">';
			 		html += documentUrl;
			 		html += '</td>' ;
			 		
			 		html +=	'<td id="status_';
			 		html += invoice_Index;
			 		html += '">';
			 		html += status;
			 		html += '</td>' ;
			 		
			 		html +=	'<td>';
			 		html += '<input type="button" value="Process" id="';
			 		html +=	invoice_Index ;  
			 		html += '" onclick="popUpBillDetails(this.id)">'; //Id
			 		html += '</td>' ; 
			 		
		 		html += '</tr>'; 
		 		
		 		
		 		
		 	}
	 			
		 	//<a href="#" style="position:fixed; bottom:10px; left:10px;" onclick="close_iframe">Close Window</a>
		 	
	 		html += '</table>';
//	 		html += '<div id="divId" title="Approval Invoices" />';
	 		html += '</form>';
	 		html += '<div id="dialog" style="display:none;" title="Approval Invoices">\
			      <iframe style="float:left;" id="myIframe" src="" width="600" height="700"></iframe> </br> </br>\
			       <iframe style="float:left;"  id="myIframe1" src="" width="590" height="700"></iframe>\
			</div>';
	 		html += '</body></html>';
	  
	 		response.write(html); 
}