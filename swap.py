import json

with open('data/projects_2026.json', 'r') as f:
    data = json.load(f)

projects = data['projects']

bini_idx = -1
chow_idx = -1

for i, p in enumerate(projects):
    if 'bini' in p.get('faculty_pi', '').lower() or 'bini' in p.get('project_id', '').lower() or 'Stefano Bini' in p.get('faculty_pi', ''):
        bini_idx = i
    if 'chow' in p.get('faculty_pi', '').lower() or 'chow' in p.get('project_id', '').lower() or 'Michael Chow' in p.get('faculty_pi', ''):
        chow_idx = i

if bini_idx != -1 and chow_idx != -1:
    projects[bini_idx], projects[chow_idx] = projects[chow_idx], projects[bini_idx]
    
    with open('data/projects_2026.json', 'w') as f:
        json.dump(data, f, indent=2)
    print(f"Swapped indices {bini_idx} and {chow_idx}")
else:
    print(f"Could not find one of them: Bini: {bini_idx}, Chow: {chow_idx}")
