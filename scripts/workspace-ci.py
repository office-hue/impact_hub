#!/usr/bin/env python3
"""Exact Git event range and affected native tests, without DEV classifications."""
import argparse
import json
from pathlib import Path
import subprocess


def changed(base, head):
    for ref in (base, head):
        if not ref or ref.startswith('-'):
            raise ValueError('invalid event commit')
        subprocess.run(['git', 'cat-file', '-e', ref + '^{commit}'], check=True, capture_output=True)
    result = subprocess.run(['git', 'diff', '--name-only', '--no-renames', '-z', base, head], check=True, capture_output=True)
    return [item.decode('utf-8', errors='surrogateescape') for item in result.stdout.split(b'\0') if item]


def product_tests(paths):
    # The former all-code lane included tools/coupon, embedded product sources
    # and WordPress. Keep its real Jest coverage, excluding only the retired
    # DEV adapter's own fixture/test source (covered by retirement tests).
    return any(path in ('package.json', 'package-lock.json', 'jest.config.cjs', 'tools/jest.config.js')
               or (path.startswith(('tools/', 'wp-content/', 'ai-agent/'))
                   and not path.startswith(('tools/fixtures/dev-delivery-v2/', 'tools/__tests__/dev-delivery-v2-adapter.test.ts')))
               for path in paths)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', required=True)
    parser.add_argument('--head', required=True)
    args = parser.parse_args()
    paths = changed(args.base, args.head)
    print(json.dumps({'kind': 'native-check-scope', 'base': args.base, 'head': args.head,
                      'changedPaths': paths, 'productTestsRequired': product_tests(paths),
                      'lifecycleExecuted': False, 'authorityGranted': False}))


if __name__ == '__main__':
    main()
