import osmium,json,argparse,hashlib
parser=argparse.ArgumentParser(description="Extract public food-business search candidates, never stock or approved places")
parser.add_argument("input");parser.add_argument("--as-of",required=True);parser.add_argument("--accessed",required=True);parser.add_argument("--output",required=True);args=parser.parse_args()
from pathlib import Path
class Food(osmium.SimpleHandler):
 def __init__(self):super().__init__();self.rows=[]
 def add(self,o,kind,lat,lon):
  t=dict(o.tags);a=t.get('amenity');shop=t.get('shop');name=t.get('name')
  if not name or len(name)>120 or a not in ('restaurant','fast_food','cafe','food_court','pub','bar') and shop not in ('supermarket','convenience','department_store','deli','butcher'):return
  if not (37.62<=lat<=37.812 and -122.53<=lon<=-122.35):return
  street=' '.join(filter(None,[t.get('addr:housenumber'),t.get('addr:street')]))
  address=', '.join(filter(None,[street,t.get('addr:city')]))
  self.rows.append(dict(id=kind+'/'+str(o.id),name=name,address=address[:250],latitude=round(lat,7),longitude=round(lon,7),category='grocery' if shop else 'fast_food' if a=='fast_food' else 'cafe' if a=='cafe' else 'restaurant',source='OpenStreetMap',source_as_of=args.as_of))
 def node(self,o):
  if o.location.valid():self.add(o,'node',o.location.lat,o.location.lon)
 def way(self,o):
  if not o.tags.get('name'):return
  try:
   coords=[(n.lat,n.lon) for n in o.nodes if n.location.valid()]
   if coords:self.add(o,'way',(min(x[0] for x in coords)+max(x[0] for x in coords))/2,(min(x[1] for x in coords)+max(x[1] for x in coords))/2)
  except osmium.InvalidLocationError:pass
reader=osmium.io.Reader(args.input);header=reader.header();stamp=header.get('osmosis_replication_timestamp') or header.get('timestamp');reader.close()
if stamp and stamp[:10]!=args.as_of:raise SystemExit('Source date does not match the PBF header')
h=Food();h.apply_file(args.input,locations=True,idx='flex_mem');rows=sorted(h.rows,key=lambda r:r['id'])
Path(args.output).write_text(json.dumps({'source':'OpenStreetMap contributors, BBBike San Francisco extract','as_of':args.as_of,'accessed':args.accessed,'source_sha256':hashlib.sha256(Path(args.input).read_bytes()).hexdigest(),'bounds':[37.62,-122.53,37.812,-122.35],'way_centers':'bounding-box centers','places':rows},ensure_ascii=False,separators=(',',':'))+'\n')
print(json.dumps({'public_food_businesses':len(rows),'bytes':Path(args.output).stat().st_size}))
