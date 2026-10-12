#!/usr/bin/env python3
"""Regtest native SegWit v0 address/scripthash conversion for the fixture."""
import argparse
import hashlib

ALPHABET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l"


def polymod(values):
    checksum = 1
    generators = (0x3B6A57B2, 0x26508E6D, 0x1EA119FA, 0x3D4233DD, 0x2A1462B3)
    for value in values:
        top = checksum >> 25
        checksum = ((checksum & 0x1FFFFFF) << 5) ^ value
        for index, generator in enumerate(generators):
            if (top >> index) & 1:
                checksum ^= generator
    return checksum


def expand(hrp):
    return [ord(char) >> 5 for char in hrp] + [0] + [ord(char) & 31 for char in hrp]


def convert(values, source_bits, target_bits, pad):
    accumulator = bits = 0
    result = []
    for value in values:
        if value < 0 or value >> source_bits:
            raise ValueError("invalid address data")
        accumulator = (accumulator << source_bits) | value
        bits += source_bits
        while bits >= target_bits:
            bits -= target_bits
            result.append((accumulator >> bits) & ((1 << target_bits) - 1))
    if pad and bits:
        result.append((accumulator << (target_bits - bits)) & ((1 << target_bits) - 1))
    elif not pad and (bits >= source_bits or (accumulator << (target_bits - bits)) & ((1 << target_bits) - 1)):
        raise ValueError("invalid address padding")
    return result


def encode(program):
    if len(program) not in (20, 32):
        raise ValueError("SegWit v0 program must be 20 or 32 bytes")
    data = [0] + convert(program, 8, 5, True)
    checksum = polymod(expand("bcrt") + data + [0] * 6) ^ 1
    return "bcrt1" + "".join(ALPHABET[value] for value in data) + "".join(
        ALPHABET[(checksum >> (5 * (5 - index))) & 31] for index in range(6))


def scripthash(address):
    if not address or (address != address.lower() and address != address.upper()):
        raise ValueError("mixed-case address")
    address = address.lower()
    if not address.startswith("bcrt1") or len(address) > 90:
        raise ValueError("fixture requires a regtest native SegWit v0 receive address")
    try:
        values = [ALPHABET.index(char) for char in address[5:]]
    except ValueError as error:
        raise ValueError("invalid address characters") from error
    if len(values) < 7 or polymod(expand("bcrt") + values) != 1 or values[0] != 0:
        raise ValueError("invalid SegWit v0 address or checksum")
    program = bytes(convert(values[1:-6], 5, 8, False))
    if len(program) not in (20, 32):
        raise ValueError("invalid SegWit v0 program length")
    script = bytes([0, len(program)]) + program
    return hashlib.sha256(script).digest()[::-1].hex()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("address")
    args = parser.parse_args()
    try:
        print(scripthash(args.address))
    except ValueError as error:
        parser.exit(1, f"invalid fixture address: {error}\n")
