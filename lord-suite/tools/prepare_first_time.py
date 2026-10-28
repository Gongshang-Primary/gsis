"""Rebuild clean new-instance templates from the current Source, without copying credentials."""
from pathlib import Path
import json
import shutil
import sys
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'First_Time_Setup'))
from configure_instance import assert_external_configuration, assert_runtime_tree

def prepare():
    target = ROOT/'First_Time_Setup/templates'
    assert_runtime_tree(ROOT/'Source')
    assert_runtime_tree(target)
    assert_external_configuration((ROOT/'Source/backend/Code.gs').read_text(),
        [(ROOT/'Source'/app/'_worker.js').read_text() for app in ['lord','overlord','starlord']])
    for app in ['backend','lord','overlord','starlord']:
        shutil.copytree(ROOT/'Source'/app, target/app, dirs_exist_ok=True)
    (target/'backend/appsscript.json').write_text(json.dumps({
        'timeZone':'Asia/Singapore',
        'dependencies':json.loads((ROOT/'Source/backend/appsscript.services.fragment.json').read_text())['dependencies'],
        'exceptionLogging':'STACKDRIVER','runtimeVersion':'V8'
    },indent=2)+'\n')
    for name in ['FIRST_TIME_SETUP.md','BACKEND_USER_MANUAL.md','VALIDATION.md','V18_UAT_GUIDE.md','CHANGELOG_V1.8_UAT.md','CHANGELOG_v0.9.md','PHOTO_UPLOAD_RELIABILITY.md']:
        shutil.copyfile(ROOT/'docs'/name,ROOT/'First_Time_Setup'/name)
    shutil.copyfile(ROOT/'docs/WHATSAPP_SETUP.md',ROOT/'First_Time_Setup/WHATSAPP_SETUP.md')
    template_source = ROOT/'Review/LORD_V1.8_UAT_WHATSAPP_TEMPLATES.json'
    if not template_source.exists():
        template_source = ROOT/'First_Time_Setup/LORD_V1.8_UAT_WHATSAPP_TEMPLATES.json'
    templates = json.loads(template_source.read_text())
    templates.pop('business', None)
    templates.pop('sender', None)
    (ROOT/'First_Time_Setup/LORD_V1.8_UAT_WHATSAPP_TEMPLATES.json').write_text(json.dumps(templates,indent=2)+'\n')
    shutil.copytree(ROOT/'docs/gsis-integration', ROOT/'First_Time_Setup/gsis-integration', dirs_exist_ok=True)

if __name__ == '__main__':
    prepare()
    print('Clean templates rebuilt. Run the release checks before packaging.')
