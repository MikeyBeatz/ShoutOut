// Explicit laboratory inputs, not production timing or a cloud billing claim.
export function newsDetectionModel({ publications, intervalMillis, windowMillis=60000, signal=false }) {
 if(!Array.isArray(publications)||!Number.isSafeInteger(intervalMillis)||intervalMillis<1||!Number.isSafeInteger(windowMillis)||windowMillis<1)throw new Error('invalid-news-detection-model');
 if(publications.some((event,i)=>!Number.isSafeInteger(event)||event<0||event>=windowMillis||i&&event<publications[i-1]))throw new Error('invalid-news-event');
 let probes=0,wake=null;const latencies=[];
 if(signal){for(const event of publications){if(wake===null||event>=wake){wake=event+intervalMillis;probes++;}latencies.push(wake-event);}}
 else {probes=Math.ceil(windowMillis/intervalMillis);for(const event of publications)latencies.push((Math.floor(event/intervalMillis)+1)*intervalMillis-event);}
 return {windowMillis,publications:publications.length,probeRequests:probes,
  signalDocumentWrites:signal?publications.length:0,signalListenerReadModel:signal?1+publications.length:0,
  maximumModeledDelayMillis:Math.max(0,...latencies)};
}
