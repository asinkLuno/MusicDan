"""Write Java properties without breaking passwords containing special characters."""
import os
from pathlib import Path


def escape(value: str) -> str:
    result = []
    for character in value:
        if character in "\\ :=#!":
            result.append("\\" + character)
        elif character in "\n\r\t\f":
            result.append({"\n": r"\n", "\r": r"\r", "\t": r"\t", "\f": r"\f"}[character])
        elif ord(character) > 126 or ord(character) < 32:
            encoded = character.encode("utf-16-be")
            for index in range(0, len(encoded), 2):
                result.append(f"\\u{int.from_bytes(encoded[index:index + 2], 'big'):04x}")
        else:
            result.append(character)
    return "".join(result)


if __name__ == "__main__":
    properties = {
        "keyAlias": os.environ["KS_ALIAS"],
        "keyPassword": os.environ["KS_KEY_PASS"],
        "storeFile": str(Path("android-signing/musicdan.keystore").resolve()),
        "storePassword": os.environ["KS_STORE_PASS"],
    }
    Path("src-tauri/gen/android/keystore.properties").write_text(
        "".join(f"{key}={escape(value)}\n" for key, value in properties.items()),
        encoding="ascii",
    )
