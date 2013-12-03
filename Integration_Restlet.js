/**
 * Author: Mohammed and Kalyan
 * Date: 29th July 2013
 * Description: Restlet to receive inputs from external integration tool and update records to NS.
 * File Name: Lazada_integration_Restlet.js
 * 
 */

var InternalID_Lookup;
var Support_Lookups;
var Response = new Object();

function post_request(request)
{
	
	//nlapiLogExecution("debug", "Request",JSON.stringify(request));
	Support_Lookups=new Object();
	Response.Header=new Object();
	Response.Header.EntryTime=new Date();
	Response.Header.Status="failed";
	Response.Header.Message="";
	Response.Header.ExitTime;
	Response.Header.Batch_no;
	Response.Header.Batch_size;
	Response.Header.Request_type;
	Response.Header.Unprocessed_recs;
	Response.recordStatus=null;
	Response.Header.EchoObj; 
	var Envelope= new Object();
	
	try
	{
	 
		request=request.Envelope;
		var Request_Type=request.type;
		var Mainlinefilter=request.Mainlinefilter;
		Response.Header.Batch_no=request.Batch_no;
		var request_records = new Array();
		
		if (!('record' in request))
		{
			Response.Header.Message="record or record array not exists, Check JSON syntax";
			Response.Header.ExitTime=new Date();
			//nlapiLogExecution("debug", "Response",JSON.stringify(Response));
			return Response;
		}
				
		if (!( Object.prototype.toString.call(request.record) === '[object Array]' ))
		{
			if (request.record!= '' || request.record!=null)
			{
				request_records[0] = request.record;
			}
			else
			{
				Response.Header.Message="Blank record received";
				Response.Header.ExitTime=new Date();
		
				Response.recordStatus=null;
				//nlapiLogExecution("debug", "Response",JSON.stringify(Response));
				return Response;
			}
			
		}
	
	}
	catch(ex)
	{
		Response.Header.Message="Check JSON syntax";
		Response.Header.ExitTime=new Date();
		Response.recordStatus=null;
		//nlapiLogExecution("debug", "Response",JSON.stringify(Response));
		return Response;
	}
	
	
	try
	{
		if(request_records == null || request_records== '')
		{
			request_records = request.record;
		}
	
		var ExtIds=jsonPath(request_records, "$.[*].externalid");
		
		Response.Header.Batch_size=request_records.length;
		
			if ('InternalID_Lookup' in request)
			{
				if (request.InternalID_Lookup!=null)
				{
					InternalID_Lookup=request.InternalID_Lookup;
				}
			}
			else
			{
				InternalID_Lookup=Search_InternalID_by_ExternalID(ExtIds,Request_Type,false,Mainlinefilter,"externalid",null,false);
   			    //nlapiLogExecution('DEBUG', 'internalid_lookup', JSON.stringify(InternalID_Lookup))	;
			}
		
		if ('SavedSupport_Lookups' in request)
		{
			if (request.SavedSupport_Lookups!=null)
			{
				Support_Lookups=request.SavedSupport_Lookups;
			}
		}
		else
		{
			if ('Lookups' in request)
			{
				var Clk,LKJsonpath,LkStoreat,Lktype,LkExtids,LkKeyfield,LkIgfltrs=false;
				
				
				 //nlapiLogExecution('DEBUG', 'request', JSON.stringify(request.Lookups))	;			
				 
				for (Clk in request.Lookups)
				{
					var Lkadd_filter=new Array();
					//nlapiLogExecution('DEBUG', 'ENTERED FOR LOOP', 'ENTERED FOR LOOP');
					 
					LkIgfltrs=false;
					LKJsonpath=request.Lookups[Clk].jsonpth; //Json Path
					LkStoreat=request.Lookups[Clk].Storeat; 
					Lktype=request.Lookups[Clk].type;
					LkExtids=jsonPath(request_records, LKJsonpath);
					
					//nlapiLogExecution('DEBUG', 'LkExtids', JSON.stringify(LkExtids));
					
					LkKeyfield=request.Lookups[Clk].Keyfield;
					if ('Igfltrs' in request.Lookups[Clk]) LkIgfltrs=true;
					
					if ('Add_filter' in request.Lookups[Clk]) 
						{
						//nlapiLogExecution('DEBUG', 'Add_filter type', Object.prototype.toString.call(request.Lookups[Clk].Add_filter));
						if ( Object.prototype.toString.call(request.Lookups[Clk].Add_filter) === '[object Array]' )
						{	Lkadd_filter=request.Lookups[Clk].Add_filter;}
						else
						{Lkadd_filter[0]=request.Lookups[Clk].Add_filter;}
						}
						else {Lkadd_filter=null;}
					//nlapiLogExecution('DEBUG', 'Lkadd_filter', JSON.stringify(Lkadd_filter));
					Support_Lookups[LkStoreat]=Search_InternalID_by_ExternalID(LkExtids,Lktype,true,false,LkKeyfield,Lkadd_filter,LkIgfltrs);
					//nlapiLogExecution("debug", "lookup: "+Clk, JSON.stringify(Support_Lookups[LkStoreat]));
				}
				
			}
		}
		
		var ScriptTimeout=Integrate_Records(request_records,Request_Type);
		
		Response.Header.EchoObj=null;
		
		if (!ScriptTimeout)
		{
			Response.Header.Message="OK";
			Response.Header.Status="success";
			Response.Header.ExitTime=new Date();
			Response.recordStatus=InternalID_Lookup;
		}
		else
		{
			Response.Header.Message="Script time out";
			Response.Header.Status="Partially processed";
			Response.Header.ExitTime=new Date();
			if (InternalID_Lookup!=null)
			{
				request.InternalID_Lookup=InternalID_Lookup;
			}
			
			if (Support_Lookups!=null)
			{
				request.SavedSupport_Lookups=Support_Lookups;
			}
			
			Envelope.Envelope=request;
			Response.Header.EchoObj=JSON.stringify(Envelope);
			Response.recordStatus=null;
		}
		
		Response.Header.Request_type=Request_Type;
		//nlapiLogExecution("debug", "Response",JSON.stringify(Response));
		return Response;
	} 
	catch(ex)
	{
		Response.Header.Message="Unexpected Error details: "  +  ex.toString();
		Response.Header.ExitTime=new Date();
		Response.recordStatus=null;
		return  Response;
	}
}

//helper functions
function GetvaluefromArr(Id,Arr,Binary_S_mode)
{
	if (Arr==null || Arr[0]=='undefined') return null;
	
	if (Binary_S_mode) return GetvaluefromArr_BS(Id,Arr);
	
	for (var i=0;i<Arr.length;i++)	
	{
		if (Arr[i].externalid==Id) return Arr[i].internalid;
	}
	return null;
}

function GetvaluefromArr_BS(value,items)
{

	    var startIndex  = 0,
	        stopIndex   = items.length - 1,
	        middle      = Math.floor((stopIndex + startIndex)/2);

	    while(items[middle].externalid != value && startIndex < stopIndex)
	    {
	        //adjust search area
	        if (value < items[middle].externalid)
	        {
	            stopIndex = middle - 1;
	        } else if (value > items[middle].externalid)
	        {
	            startIndex = middle + 1;
	        }

	        //recalculate middle
	        middle = Math.floor((stopIndex + startIndex)/2);
	    }

	    //make sure it's the right value
	    return (items[middle].externalid != value) ? null : items[middle].internalid;
	}


function PutStatustoObj(Id,Arr,Val, Errmsg)
{
	
	if (Arr==null) return null;
	
	for (var i=0;i<Arr.length;i++)
	{
		if (Arr[i].externalid==Id)
		{
			Arr[i].status=Val;
			Arr[i].errmsg = Errmsg;
			break;
		}
	}

}


function Search_InternalID_by_ExternalID(ExternalIDs,type,Supportcall,Mainlinefilter,Keyfield,Add_filter,igfilters)
{
	
	
	if ((ExternalIDs==null||ExternalIDs=='null'||ExternalIDs=='undefined') && (!igfilters)) return [];
	
	var filters=new Array();
	var Columns=new Array();
	var FilterIdx,Lbound_FilterIdx=1;
	
	if (!igfilters) filters[0]=new nlobjSearchFilter(Keyfield, null, 'anyof', ExternalIDs);
	
	//nlapiLogExecution('DEBUG','filters - Keyfield', Keyfield);
	
	//nlapiLogExecution('DEBUG','ExternalIDs', JSON.stringify(ExternalIDs));
	
	//nlapiLogExecution('DEBUG','filters', JSON.stringify(filters));
	
	if (!igfilters) 
		{
	if (Mainlinefilter==true)
	{
		filters[1] = new nlobjSearchFilter('mainline', null, 'is', 'T');
		Lbound_FilterIdx=2;
	}
	
		}
	else
		{
		Lbound_FilterIdx=0;
		}
	
	if (Add_filter!=null)
	{
		/* additional filter logic */
		for(FilterIdx=0;FilterIdx<Add_filter.length;FilterIdx++)
			{
			//nlapiLogExecution('DEBUG','entered filter loop. Add_filter contents', JSON.stringify(Add_filter));
			filters[FilterIdx + Lbound_FilterIdx] = new nlobjSearchFilter(Add_filter[FilterIdx].KeyField,null,Add_filter[FilterIdx].Oper,Add_filter[FilterIdx].Value);
			}
	}
	
	//nlapiLogExecution('DEBUG','filters final', JSON.stringify(filters));
	
	var SearchResults;
	Columns[0]=new nlobjSearchColumn (Keyfield).setSort(); //sort, this will enable binary search
	Columns[1]=new nlobjSearchColumn ("internalid");
	
	//if (igfilters) SearchResults = nlapiSearchRecord(type,null,null, Columns);
	//else SearchResults = nlapiSearchRecord(type,null,filters, Columns);
	
	SearchResults = nlapiSearchRecord(type,null,filters, Columns);
	
	var Result_Objs=[];
	
	if (SearchResults!=null) 
	{
		for(var i=0;i<SearchResults.length;i++)
		{
			ResObj=new Object();
			ResObj.externalid=SearchResults[i].getValue(Keyfield);
			ResObj.internalid=SearchResults[i].getValue("internalid");
			
			if (!Supportcall)
			{
				ResObj.status="Script timeout";
				ResObj.errmsg="";
			}
			
			Result_Objs.push(ResObj);
		}
	}
	
	//nlapiLogExecution('DEBUG','results', JSON.stringify(Result_Objs));
	return Result_Objs; 
	
}

function CastDate(bob_Date) {
	try {
			
		   if (bob_Date!=null)
		   {
				var convertDate =  bob_Date.replace(/-/g, "/");
				var date_string = nlapiDateToString(nlapiStringToDate(convertDate,'datetimetz'), 'datetimetz');
				return date_string;
		   }
		} 
		catch(e) 
		{
			return '';
		}
}

// done helper functions

function Integrate_Records(Records,type) {

	Response.Header.Unprocessed_recs=0;
	var Script_timeout=false;	
	
		if (Records==null) return;
	
			var NSRecord,UpdateFlag=false;
		
			for (Ridx=0;Ridx<Records.length;Ridx++)
			{
				try
				{
					var IntId = '';
					var RecErrMsg='';
					var InternalId;
					
					var record = Records[Ridx];
					 UpdateFlag = false;
						//nlapiLogExecution("debug", "internal id from broker rec: "+record.internalid.$+ " External id:"+record.externalid,"check");
					 if (record.internalid.$!='' && record.internalid.$!=null && record.internalid.$!='undefined')
						 {//use internalid if available
						 InternalId=record.internalid.$;
						 }
					 else
					{ //locate internal id from array incase not available from broker
						 InternalId = GetvaluefromArr(record.externalid,InternalID_Lookup,false);
						 //nlapiLogExecution("debug", "internal id from broker rec not defined. from arr: "+record.internalid.$+ " External id:"+record.externalid,"check 2");
					}
					 
					NSRecord=null;
				
					if (InternalId==null ||InternalId=='')
					{
						NSRecord = nlapiCreateRecord (type);				
					}
					else
					{
						// Load existing record
						UpdateFlag = true;
						
						//attempt to load the existing record
						try
						{
						NSRecord = nlapiLoadRecord (type,InternalId);
						//nlapiLogExecution("debug", "loaded using internalid:"+InternalId+ " External id:"+record.externalid, JSON.stringify(NSRecord));
						}
						catch (L_ex)
						{
							//netsuite record might have been deleted manually. create new record and redirect
							NSRecord = nlapiCreateRecord (type);
							UpdateFlag = false; //change to add mode
						}
					//nlapiLogExecution("debug", "AFTER LOAD NSRecord internalid:"+InternalId+ " External id:"+record.externalid, JSON.stringify(NSRecord));
					}
					
						
					for(var Fidx=0;Fidx<Object.keys(record).length;Fidx++)
					{//Set NS fields based on integration inputs
						
						var Fldnm,Fldval;
						
						Fldnm=Object.keys(record)[Fidx];
						Fldval=record[Fldnm];
						
						if(!(Object.prototype.toString.call(Fldval) === '[object Object]') )
						{
							NSRecord.setFieldValue (Fldnm, Fldval);
						}
						else
						{
							//added new
							if (UpdateFlag)
							{
							if ('DNU' in Fldval) continue;
							}			
							
							if ('DMY' in Fldval)
							{	/* do nothing*/  continue;}
							else /*added new*/ if ('SelectField' in Fldval)
							{
								NSRecord.setFieldText (Fldnm, Fldval.$);
							}
							else if ('DNU' in Fldval)
							{
								NSRecord.setFieldValue (Fldnm, Fldval.$);
							}
							else if ('Date' in Fldval)
							{
								if (Fldval.$!=null && Fldval.$!='' && Fldval.$!='undefinied') NSRecord.setFieldValue (Fldnm, CastDate(Fldval.$));
							}
							else if ('Lkname' in Fldval)
							{
								//nlapiLogExecution("Debug", "external id:"+Fldval.$+"lookupname:"+Fldval.Lkname, "internal id:"+GetvaluefromArr(Fldval.$,Support_Lookups[Fldval.Lkname]));
								//nlapiLogExecution("Debug", "lookup:"+Fldval.Lkname+" contents", JSON.stringify(Support_Lookups[Fldval.Lkname]));
								//nlapiLogExecution("Debug", "set field name:"+Fldnm+" contents: ", Fldnm);
								var LkRes=GetvaluefromArr(Fldval.$,Support_Lookups[Fldval.Lkname],true);
								if (LkRes==null) 
								{throw new UserException("Lookup for: "+Fldnm+" failed, while looking for: "+Fldval.$);}
								else
									{
								NSRecord.setFieldValue (Fldnm, LkRes);
									}
							}						
							else if ('SublistKey' in Fldval)
							{
									var SublistStatus;
									SublistStatus=Integrate_Sublist(NSRecord,Fldval.List,Fldval.SublistKey,Fldval.NSsublistNm,UpdateFlag);		
									
									if(!SublistStatus)
									{
										//throw sublist fail
									}
							
							}	
						}
					}
					//nlapiLogExecution("debug", "BEFORE SUBMIT NSRecord internalid:"+InternalId+ " External id:"+record.externalid, JSON.stringify(NSRecord));
					IntId = nlapiSubmitRecord(NSRecord, true, false);
					//nlapiLogExecution("debug", "AFTER SUBMIT NSRecord internalid:"+InternalId+ " External id:"+record.externalid, JSON.stringify(NSRecord));
				}
				catch(ex)
				{
					IntId = '';
					RecErrMsg="Errcode: " + ex.Code+ " Message: "+ ex.message;
					//nlapiLogExecution("debug", "exceptions:"+ex.toString());
					//nlapiLogExecution("debug","Intid value:", IntId);
					//nlapiLogExecution("debug","UpdateFlag: ",UpdateFlag);
				}
					
				
				if (!UpdateFlag)
				{
					var ResObj=new Object();
					ResObj.externalid=record.externalid;
					ResObj.internalid=IntId;
					
					if(IntId == '')
					{
						ResObj.status="Create Failed";
						ResObj.errmsg=RecErrMsg;
					}
					else
					{
						ResObj.status="C Success";
						ResObj.errmsg="";
					}
					
					InternalID_Lookup.push(ResObj);
				}
				else
				{
					if(IntId == '')
					{
						PutStatustoObj(record.externalid,InternalID_Lookup, "Update Failed",RecErrMsg);
					}
					else
					{
						PutStatustoObj(record.externalid,InternalID_Lookup, "U Success","");
					}
				}
				
				//eliminate script and usage timeout
					if ((((new Date() - Response.Header.EntryTime)/1000)>250)||(nlapiGetContext().getRemainingUsage()<300))
					{
						Response.Header.Unprocessed_recs=Records.length-(Ridx + 1);
						//splice complete records
						Records.splice(0,Ridx+1);
						
						if (Records.length!=0)
						{
							Script_timeout=true;	
							break;
						}
					
					}
			}
		
		return Script_timeout;
}

function Integrate_Sublist(NSR,Sublist,Key,NSsublistNm,UpdateFlag)
{
	var SublistSuccess=true,ArrSublist=[];	
	if (Sublist==null) return SublistSuccess;
	
		if (( Object.prototype.toString.call(Sublist) === '[object Array]' ))
		{
			ArrSublist=Sublist;
		}
		else
		{
			ArrSublist[0]=Sublist;
		}
	
	for(OSublistIdx=0;OSublistIdx<ArrSublist.length;OSublistIdx++)
	{
		var OSublistkey=ArrSublist[OSublistIdx][Key];
		var Olineitem=ArrSublist[OSublistIdx];
		var Linefound=false;
		
		for(NSSublistIdx=1;NSSublistIdx<=NSR.getLineItemCount(NSsublistNm);NSSublistIdx++)
		{	
			if(OSublistkey==NSR.getLineItemValue (NSsublistNm, Key, NSSublistIdx))
			{
			
				NSR.selectLineItem(NSsublistNm,NSSublistIdx);
				Linefound=true;
				break;
			}
			
		}
	
			if (!Linefound)
			{
				NSR.selectNewLineItem (NSsublistNm);
			}
	
		for(var OLineFidx=0;OLineFidx<Object.keys(Olineitem).length;OLineFidx++)
    	 {
			var Fldnm,Fldval;
	
			Fldnm=Object.keys(Olineitem)[OLineFidx];
			Fldval=Olineitem[Fldnm];
			
			if(!(Object.prototype.toString.call(Fldval) === '[object Object]') )
			{
			
				NSR.setCurrentLineItemValue (NSsublistNm,Fldnm, Fldval);
			}
			else
			{
			
				//added new
				if (UpdateFlag)
				{
				if ('DNU' in Fldval) continue;
				}			
				//added new
				
			if ('Date' in Fldval)
			{
				//if (Fldval.$!=null && Fldval.$!='' && Fldval.$!='undefinied') NSR.setCurrentLineItemDateTimeValue (NSsublistNm,Fldnm, CastDate(Fldval.$));
				if (Fldval.$!=null && Fldval.$!='' && Fldval.$!='undefinied') NSR.setCurrentLineItemValue (NSsublistNm,Fldnm, CastDate(Fldval.$));
			}
			else if ('Lkname' in Fldval)
			{
				
				//new addition
				
				//nlapiLogExecution("debug","before LKRES Declare","check");
				
				var LkRes=GetvaluefromArr(Fldval.$,Support_Lookups[Fldval.Lkname],true);
				
				//nlapiLogExecution("debug","LKRes",LkRes);
				
				if (LkRes==null) 
				{throw new UserException("Lookup for: "+Fldnm+" failed, while looking for: "+Fldval.$);}
				else
					{
					//NSR.setCurrentLineItemValue(NSsublistNm,Fldnm, GetvaluefromArr(Fldval.$,Support_Lookups[Fldval.Lkname]));
					//nlapiLogExecution("debug","before","before set");
					NSR.setCurrentLineItemValue(NSsublistNm,Fldnm,LkRes);
					//nlapiLogExecution("debug","Field: " + Fldnm+" incoming from broker: "+Fldval.$, " value set to field:" + LkRes);
					}
				
				//new addition
			}
			else if ('DNU' in Fldval)
			{
				NSR.setCurrentLineItemValue (NSsublistNm,Fldnm, Fldval.$);
			}
			
			}

    	 }
		NSR.commitLineItem(NSsublistNm);
		
	}

	return SublistSuccess;
}

function UserException(message) {
	   this.message = message;
	   this.name = "Lookup_failure";
	}