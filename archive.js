/* ZIP simple sin comprimir (STORE), compatible con archivos locales y AutoCAD. */
window.FVZip = (()=>{
 const enc=new TextEncoder(),dec=new TextDecoder();
 const crcTable=new Uint32Array(256);
 for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);crcTable[n]=c>>>0}
 function crc32(bytes){let c=0xffffffff;for(let i=0;i<bytes.length;i++)c=crcTable[(c^bytes[i])&255]^(c>>>8);return(c^0xffffffff)>>>0}
 function u16(v){return [v&255,(v>>>8)&255]}
 function u32(v){return [v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255]}
 async function raw(v){if(v instanceof Blob)return new Uint8Array(await v.arrayBuffer());if(v instanceof ArrayBuffer)return new Uint8Array(v);if(v instanceof Uint8Array)return v;return enc.encode(String(v))}
 async function build(files){let offset=0,body=[],central=[];for(const file of files){const name=enc.encode(file.name),data=await raw(file.data);if(data.length>0xffffffff)throw Error('Archivo individual de más de 4 GB no admitido.');const crc=crc32(data),flag=2048;const local=new Uint8Array([80,75,3,4,...u16(20),...u16(flag),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...name]);body.push(local,data);central.push(new Uint8Array([80,75,1,2,...u16(20),...u16(20),...u16(flag),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset),...name]));offset+=local.length+data.length}
 const centralSize=central.reduce((s,x)=>s+x.length,0);const end=new Uint8Array([80,75,5,6,...u16(0),...u16(0),...u16(central.length),...u16(central.length),...u32(centralSize),...u32(offset),...u16(0)]);return new Blob([...body,...central,end],{type:'application/zip'})}
 async function read(file){const b=new Uint8Array(await file.arrayBuffer()),dv=new DataView(b.buffer),out=new Map();let p=0;while(p+30<=b.length&&dv.getUint32(p,true)===0x04034b50){const method=dv.getUint16(p+8,true),size=dv.getUint32(p+18,true),n=dv.getUint16(p+26,true),extra=dv.getUint16(p+28,true),start=p+30+n+extra,name=dec.decode(b.slice(p+30,p+30+n));if(method!==0)throw Error('Este proyecto ZIP debe ser guardado por FV360 (formato STORE).');if(start+size>b.length)throw Error('Proyecto ZIP incompleto.');out.set(name,new Blob([b.slice(start,start+size)]));p=start+size}return out}
 return {build,read}
})();
