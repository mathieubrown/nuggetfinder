"""Bounded subprocess protocol: JSON on stdin/stdout, original bytes stay in memory."""
import base64,json,sys,resource
from process_image import process_image
# macOS RLIMIT_AS is not enforced reliably. Production must additionally use container limits.
resource.setrlimit(resource.RLIMIT_CPU,(8,8))
if sys.platform.startswith('linux'):resource.setrlimit(resource.RLIMIT_AS,(240*1024*1024,240*1024*1024))
resource.setrlimit(resource.RLIMIT_FSIZE,(0,0))
raw=sys.stdin.buffer.read(12*1024*1024+1)
if len(raw)>12*1024*1024: raise ValueError('input_limit')
request=json.loads(raw)
result=process_image(base64.b64decode(request['bytes'],validate=True),request.get('crop'),request.get('redactions',[]))
for variant in result['variants'].values():variant['bytes']=base64.b64encode(variant['bytes']).decode('ascii')
sys.stdout.write(json.dumps(result,separators=(',',':')))
