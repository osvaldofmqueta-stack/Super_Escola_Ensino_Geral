#!/usr/bin/env python3
"""
patch-bundle-drawer.py
Corrige o bundle compilado para:
1. Adicionar "Painel da Secretaria" como primeiro item nas secções Secretaria
   do CEO e do Admin/Director (que não têm esse item).
2. Mover cada secção Secretaria para logo após a secção "Área Pedagógica"
   no seu bloco respectivo.
"""

import re
import shutil

BUNDLE = "dist/_expo/static/js/web/entry-9490fb95215ea14158e004104153d08b.js"

with open(BUNDLE, "r", encoding="utf-8") as f:
    src = f.read()

# ── Helpers ─────────────────────────────────────────────────────────────────

def find_object_end(s, start):
    """Dado o índice de '{', devolve o índice do '}' correspondente."""
    depth = 0
    for i in range(start, len(s)):
        if s[i] == '{':
            depth += 1
        elif s[i] == '}':
            depth -= 1
            if depth == 0:
                return i
    return -1

def find_array_end(s, start):
    """Dado o índice de '[', devolve o índice do ']' correspondente."""
    depth = 0
    for i in range(start, len(s)):
        if s[i] == '[':
            depth += 1
        elif s[i] == ']':
            depth -= 1
            if depth == 0:
                return i
    return -1

# ── Item "Painel da Secretaria" a injectar ───────────────────────────────────
PAINEL_ITEM = (
    "{label:'Painel da Secretaria',"
    "route:'/(main)/secretaria-hub?tab=visao',"
    "icon:(0,k.jsx)(p.Ionicons,{name:\"grid\",size:20,color:\"inherit\"}),"
    "permKey:'secretaria_hub'},"
)

# ── Passo 1: encontrar posições de todos os blocos Secretaria ────────────────
secretaria_blocks = []  # (start_of_title, end_of_object, has_painel)
for m in re.finditer(r"title:'Secretaria'", src):
    title_pos = m.start()
    # Recuar para encontrar o início do objecto {
    obj_start = title_pos
    while obj_start > 0 and src[obj_start] != '{':
        obj_start -= 1
    obj_end = find_object_end(src, obj_start)
    ctx = src[obj_start:obj_start+200]
    has_painel = "Painel da Secretaria" in src[obj_start:obj_end+1]
    secretaria_blocks.append((obj_start, obj_end, has_painel))
    print(f"Secretaria block: obj_start={obj_start} obj_end={obj_end} has_painel={has_painel}")

print(f"\nTotal blocos Secretaria: {len(secretaria_blocks)}")

# Vamos processar os blocos SEM Painel (os dois que precisam de ser corrigidos)
blocks_to_fix = [(s, e) for s, e, hp in secretaria_blocks if not hp]
print(f"Blocos a corrigir: {len(blocks_to_fix)}")

# ── Passo 2: para cada bloco a corrigir ──────────────────────────────────────
# Estratégia: para cada bloco Secretaria sem Painel:
#   a) Extrair o bloco completo (incluindo vírgula antes/depois)
#   b) Adicionar Painel da Secretaria como primeiro item
#   c) Encontrar onde está a secção "Área Pedagógica" ANTES deste bloco
#      no mesmo array de secções
#   d) Remover o bloco da posição actual e inserir após Área Pedagógica

# Como estamos a modificar o src, processamos do fim para o início
# para não invalidar os índices

blocks_to_fix_sorted = sorted(blocks_to_fix, key=lambda x: x[0], reverse=True)

for obj_start, obj_end in blocks_to_fix_sorted:
    block_content = src[obj_start:obj_end+1]
    print(f"\n=== A corrigir bloco pos={obj_start} ===")
    print("Prévia:", block_content[:150])

    # a) Adicionar Painel da Secretaria como primeiro item no items:[]
    items_match = re.search(r"items:\[", block_content)
    if not items_match:
        print("  ❌ 'items:[' não encontrado no bloco")
        continue

    items_open = items_match.end()  # posição após '['
    new_block = (
        block_content[:items_open]
        + PAINEL_ITEM
        + block_content[items_open:]
    )
    print(f"  ✅ Painel da Secretaria adicionado")

    # b) Encontrar a secção "Área Pedagógica" antes deste bloco
    # Procurar o título mais próximo ANTES do bloco
    ap_pattern = r"title:'\xc1rea Pedag\xf3gica'"
    ap_positions = [m.start() for m in re.finditer(re.escape("title:'\xc1rea Pedag\xf3gica'"), src[:obj_start])]
    if not ap_positions:
        # Tentar variante
        ap_positions = [m.start() for m in re.finditer(r"title:'[^']*rea Pedag", src[:obj_start])]
    
    if not ap_positions:
        print("  ❌ 'Área Pedagógica' não encontrada antes do bloco")
        # Mesmo assim, inserir Painel mas não mover
        src = src[:obj_start] + new_block + src[obj_end+1:]
        continue

    ap_title_pos = ap_positions[-1]  # mais próximo antes do bloco
    print(f"  Área Pedagógica encontrada em pos={ap_title_pos}")

    # Encontrar o objecto que contém esse título
    ap_obj_start = ap_title_pos
    while ap_obj_start > 0 and src[ap_obj_start] != '{':
        ap_obj_start -= 1
    ap_obj_end = find_object_end(src, ap_obj_start)
    print(f"  Área Pedagógica objecto: {ap_obj_start} → {ap_obj_end}")

    if ap_obj_end == -1 or ap_obj_end >= obj_start:
        print("  ❌ Fim do objecto Área Pedagógica inválido")
        src = src[:obj_start] + new_block + src[obj_end+1:]
        continue

    # c) Verificar se Secretaria já está logo após Área Pedagógica
    gap = src[ap_obj_end+1:obj_start]
    # O gap deve ser apenas ",{title:'..." (a próxima secção entre eles)
    # Se o gap contém outra secção (Análise, Financeiro, etc.), precisamos mover
    
    next_section_match = re.search(r"\{title:'", gap)
    if next_section_match:
        next_title_in_gap = gap[next_section_match.start():][:50]
        print(f"  Secção entre Área Pedagógica e Secretaria: {next_title_in_gap}")
        need_move = True
    else:
        print("  Secretaria já está logo após Área Pedagógica")
        need_move = False

    if need_move:
        # Remover o bloco da posição actual (incluindo vírgula precedente)
        # e inserir logo após Área Pedagógica
        
        # Encontrar o ',' antes do bloco (pode ter espaços/newlines entre , e {)
        prefix_search = src[max(0, obj_start-5):obj_start]
        if ',' in prefix_search:
            remove_start = obj_start - len(prefix_search) + prefix_search.rfind(',')
        else:
            remove_start = obj_start

        # Verificar se há ',' DEPOIS do bloco
        suffix_search = src[obj_end+1:obj_end+5]
        if suffix_search.startswith(','):
            remove_end = obj_end + 2
        else:
            remove_end = obj_end + 1

        print(f"  Removendo bloco: [{remove_start}:{remove_end}]")
        
        # Construir novo src sem o bloco actual
        src_without = src[:remove_start] + src[remove_end:]
        
        # Ajustar a posição de ap_obj_end (não mudou pois está antes)
        # Inserir novo bloco após ap_obj_end
        insert_pos = ap_obj_end + 1
        # Garantir que temos uma vírgula de separação
        separator = ","
        src = src_without[:insert_pos] + separator + new_block + src_without[insert_pos:]
        print(f"  ✅ Bloco movido para logo após 'Área Pedagógica'")
    else:
        # Apenas substituir o bloco actual com o novo (que tem Painel)
        src = src[:obj_start] + new_block + src[obj_end+1:]
        print(f"  ✅ Bloco actualizado no lugar")

# ── Guardar ──────────────────────────────────────────────────────────────────
shutil.copy(BUNDLE, BUNDLE + ".bak3")
with open(BUNDLE, "w", encoding="utf-8") as f:
    f.write(src)
print(f"\n✅ Bundle guardado. Backup em {BUNDLE}.bak3")

# ── Verificação ──────────────────────────────────────────────────────────────
print("\n=== Verificação ===")
for m in re.finditer(r"title:'Secretaria'", src):
    pos = m.start()
    ctx = src[pos:pos+200]
    has_painel = "Painel da Secretaria" in ctx
    print(f"  pos={pos} | has_painel={has_painel} | {ctx[:100]}")
