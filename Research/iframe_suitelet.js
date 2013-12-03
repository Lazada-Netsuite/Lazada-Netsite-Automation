function iFrame(request, response)
{

	response.write("<html>  <frameset cols='50%,50%'>  <frame src='https://system.sandbox.netsuite.com/app/accounting/transactions/vendbill.nl?transform=purchord&whence=&id=14304&e=T&memdoc=0#&ifrmcntnr=T'>   <frame src='https://system.sandbox.netsuite.com/app/site/hosting/scriptlet.nl?script=167&deploy=1&unlayered=T&ifrmcntnr=T'> </frameset> ");
	response.write("<script src='http://code.jquery.com/ui/1.10.3/jquery-ui.js'></script>");
	response.write("<script type='text/javascript'>");
	response.write("var $dialog = $('<div></div>')
    .html('<iframe style="border: 0px; " src="' + page + '" width="100%" height="100%"></iframe>')
    .dialog({
        autoOpen: false,
        modal: true,
        height: 625,
        width: 500,
        title: "Some title"
    });
$dialog.dialog('open');

	response.write(" </script></html>");

	
}