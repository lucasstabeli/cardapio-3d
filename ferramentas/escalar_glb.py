"""
Reescala um arquivo .glb gravando o fator direto nos vértices.

No AR, 1 unidade do .glb = 1 metro. Se o modelo foi exportado fora dessa
escala, o prato aparece gigante ou minusculo na mesa.

A versao antiga desta ferramenta envolvia a cena num no pai com "scale".
Isso funciona no WebGL, mas a transformacao se perde na conversao para
USDZ que o iPhone usa no AR Quick Look — e o modelo volta ao tamanho
errado. Por isso agora a escala e' aplicada nos proprios dados de
posicao, e nas translacoes dos nos. O arquivo passa a ter o tamanho
certo por natureza, sem depender de nenhuma transformacao.

    python ferramentas/escalar_glb.py assets/models/espetinho.glb 0.00267
"""

import json
import struct
import sys
from pathlib import Path

MAGIC = 0x46546C67
JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942

FLOAT = 5126


def ler_glb(caminho: Path):
    dados = caminho.read_bytes()
    magic, versao, _ = struct.unpack_from("<III", dados, 0)
    if magic != MAGIC:
        raise ValueError(f"{caminho.name} nao e' um .glb valido")
    if versao != 2:
        raise ValueError(f"so suporto glTF 2.0 (esse e' versao {versao})")

    gltf, binario, pos = None, bytearray(), 12
    while pos < len(dados):
        tam, tipo = struct.unpack_from("<II", dados, pos)
        bloco = dados[pos + 8 : pos + 8 + tam]
        if tipo == JSON_CHUNK:
            gltf = json.loads(bloco.decode("utf-8"))
        elif tipo == BIN_CHUNK:
            binario = bytearray(bloco)
        pos += 8 + tam

    if gltf is None:
        raise ValueError("o arquivo nao tem bloco JSON")
    return gltf, binario


def escrever_glb(caminho: Path, gltf: dict, binario: bytes):
    js = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    js += b" " * (-len(js) % 4)
    bn = bytes(binario) + b"\x00" * (-len(binario) % 4)

    total = 12 + 8 + len(js) + (8 + len(bn) if bn else 0)
    saida = bytearray()
    saida += struct.pack("<III", MAGIC, 2, total)
    saida += struct.pack("<II", len(js), JSON_CHUNK) + js
    if bn:
        saida += struct.pack("<II", len(bn), BIN_CHUNK) + bn
    caminho.write_bytes(bytes(saida))


def acessores_de_posicao(gltf: dict):
    """Indices dos accessors usados como POSITION, sem repetir."""
    vistos = set()
    for malha in gltf.get("meshes", []):
        for prim in malha.get("primitives", []):
            if "KHR_draco_mesh_compression" in prim.get("extensions", {}):
                raise ValueError(
                    "malha comprimida com Draco — descomprima antes de reescalar"
                )
            idx = prim.get("attributes", {}).get("POSITION")
            if idx is not None:
                vistos.add(idx)
            alvo = prim.get("targets") or []
            for t in alvo:
                if "POSITION" in t:
                    vistos.add(t["POSITION"])
    return sorted(vistos)


def escalar_acessor(gltf: dict, binario: bytearray, idx: int, fator: float):
    ac = gltf["accessors"][idx]

    if ac.get("type") != "VEC3" or ac.get("componentType") != FLOAT:
        raise ValueError(
            f"accessor {idx} nao e' VEC3/float (type={ac.get('type')}, "
            f"componentType={ac.get('componentType')}) — provavelmente quantizado"
        )
    if "sparse" in ac:
        raise ValueError(f"accessor {idx} usa armazenamento sparse, nao suportado")

    bv = gltf["bufferViews"][ac["bufferView"]]
    base = bv.get("byteOffset", 0) + ac.get("byteOffset", 0)
    passo = bv.get("byteStride") or 12       # 12 = 3 floats justapostos

    for i in range(ac["count"]):
        off = base + i * passo
        x, y, z = struct.unpack_from("<fff", binario, off)
        struct.pack_into("<fff", binario, off, x * fator, y * fator, z * fator)

    for chave in ("min", "max"):
        if chave in ac:
            ac[chave] = [v * fator for v in ac[chave]]


def escalar_nos(gltf: dict, fator: float):
    """As translacoes tambem precisam encolher; 'scale' fica como esta'."""
    for no in gltf.get("nodes", []):
        if "translation" in no:
            no["translation"] = [v * fator for v in no["translation"]]
        if "matrix" in no:
            m = list(no["matrix"])       # column-major: translacao em 12,13,14
            m[12] *= fator
            m[13] *= fator
            m[14] *= fator
            no["matrix"] = m


def escalar_animacoes(gltf: dict, binario: bytearray, fator: float):
    """Trilhas de translacao precisam acompanhar a escala."""
    alvos = set()
    for anim in gltf.get("animations", []):
        for canal in anim.get("channels", []):
            if canal.get("target", {}).get("path") == "translation":
                alvos.add(anim["samplers"][canal["sampler"]]["output"])
    for idx in sorted(alvos):
        escalar_acessor(gltf, binario, idx, fator)
    return len(alvos)


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    origem = Path(sys.argv[1])
    fator = float(sys.argv[2].replace(",", ".").rstrip("x"))
    destino = (
        Path(sys.argv[3]) if len(sys.argv) > 3
        else origem.with_name(origem.stem + "_escalado.glb")
    )

    gltf, binario = ler_glb(origem)

    posicoes = acessores_de_posicao(gltf)
    for idx in posicoes:
        escalar_acessor(gltf, binario, idx, fator)
    escalar_nos(gltf, fator)
    n_anim = escalar_animacoes(gltf, binario, fator)

    escrever_glb(destino, gltf, binario)

    print(f"{origem.name} x {fator} -> {destino.name}")
    print(f"  {len(posicoes)} accessor(es) de posicao, "
          f"{len(gltf.get('nodes', []))} no(s), {n_anim} trilha(s) de animacao")


if __name__ == "__main__":
    main()
