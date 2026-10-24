#!/usr/bin/env python3
"""Retired DEV v2 compatibility notice; no lifecycle/check receipt is emitted."""
import json
import sys


def report(*args, **kwargs):
    return {'schemaVersion': 1, 'status': 'retired', 'advisoryOnly': True,
            'authorityGranted': False, 'writes': False,
            'sourceChecks': 'not-evaluated', 'lifecycleExecuted': False,
            'next': 'Use native Git and affected source checks; no registry is required.'}


if __name__ == '__main__':
    print(json.dumps(report()))
