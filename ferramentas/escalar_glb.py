"""
Reescala um arquivo .glb sem precisar de Blender nem de npm.

No AR, 1 unidade do .glb = 1 metro. Se o modelo foi exportado fora dessa
escala, o prato aparece gigante ou minúsculo na mesa. Abra o cardápio,
veja o fator que a etiqueta de medidas informa e rode:

    python ferramentas/escalar_glb.py assets/models/shishkebab.glb 0.00267

Gera um arquivo novo (…_escalado.glb) e mantém o original intacto.
Funciona envolvendo a cena em um nó pai com escala — a geometria e as
texturas não são tocadas.
"""

import json
import struct
import sys
from pathlib import Path

MAGIC = 0x46546C67   # "glTF"
JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


def ler_glb(caminho: Path):
    dados = caminho.read_bytes()
    magic, versao, _tamanho = struct.unpack_from("<III", dados, 0)
    if magic != MAGIC:
        raise ValueError(f"{caminho.name} não é um .glb válido")
    if versao != 2:
        raise ValueError(f"só suporto glTF 2.0 (esse é versão {versao})")

    gltf, binario, pos = None, b"", 12
    while pos < len(dados):
        tam, tipo = struct.unpack_from("<II", dados, pos)
        conteudo = dados[pos + 8 : pos + 8 + tam]
        if tipo == JSON_CHUNK:
            gltf = json.loads(conteudo.decode("utf-8"))
        elif tipo == BIN_CHUNK:
            binario = conteudo
        pos += 8 + tam

    if gltf is None:
        raise ValueError("o arquivo não tem o bloco JSON")
    return gltf, binario


def escrever_glb(caminho: Path, gltf: dict, binario: bytes):
    js = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    js += b" " * (-len(js) % 4)                     # padding com espaço
    bn = binario + b"\x00" * (-len(binario) % 4)    # padding com zero

    total = 12 + 8 + len(js) + (8 + len(bn) if bn else 0)
    saida = bytearray()
    saida += struct.pack("<III", MAGIC, 2, total)
    saida += struct.pack("<II", len(js), JSON_CHUNK) + js
    if bn:
        saida += struct.pack("<II", len(bn), BIN_CHUNK) + bn
    caminho.write_bytes(bytes(saida))


def escalar(gltf: dict, fator: float):
    """Envolve cada cena num nó pai que aplica a escala."""
    nos = gltf.setdefault("nodes", [])
    for cena in gltf.get("scenes", []):
        raizes = cena.get("nodes", [])
        if not raizes:
            continue
        nos.append({
            "name": "escala_cardapio",
            "children": list(raizes),
            "scale": [fator, fator, fator],
        })
        cena["nodes"] = [len(nos) - 1]
    return gltf


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    origem = Path(sys.argv[1])
    fator = float(sys.argv[2].replace(",", ".").rstrip("x×"))
    destino = (
        Path(sys.argv[3]) if len(sys.argv) > 3
        else origem.with_name(origem.stem + "_escalado.glb")
    )

    gltf, binario = ler_glb(origem)
    escrever_glb(destino, escalar(gltf, fator), binario)

    print(f"{origem.name} × {fator} -> {destino.name} "
          f"({destino.stat().st_size / 1_048_576:.1f} MB)")


if __name__ == "__main__":
    main()
