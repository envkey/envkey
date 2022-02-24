package cluster

import (
	"context"
	"sync"

	"github.com/envkey/envkey/public/sdks/envkey-kubernetes-watcher/kube"
	"github.com/envkey/envkey/public/sdks/envkey-kubernetes-watcher/utils"
	apps "k8s.io/api/apps/v1"
	core "k8s.io/api/core/v1"
	v1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"github.com/apex/log"
)

var DeploymentsByEnvkey map[string][]apps.Deployment
var DaemonSetsByEnvkey map[string][]apps.DaemonSet
var StatefulSetsByEnvkey map[string][]apps.StatefulSet

var syncing = false
var syncQueued = false

func Sync(namespaces []string) error {
	// Ensure only a single cluster state sync op runs at a time
	if syncing {
		syncQueued = true
		return nil
	}

	syncing = true
	syncQueued = false

	defer func() {
		syncing = false
		if syncQueued {
			err := Sync(namespaces)
			if err != nil {
				log.Error("Error processing queued cluster state sync")
			}
		}
	}()

	errs := make(chan error)
	done := make(chan bool)
	var wg sync.WaitGroup

	for _, namespace := range namespaces {
		wg.Add(3)

		go func(ns string) {
			err := syncDeployments(ns)
			if err != nil {
				errs <- err
			}
			wg.Done()
		}(namespace)

		go func(ns string) {
			err := syncDaemonSets(ns)
			if err != nil {
				errs <- err
			}
			wg.Done()
		}(namespace)

		go func(ns string) {
			err := syncStatefulSets(ns)
			if err != nil {
				errs <- err
			}
			wg.Done()
		}(namespace)
	}

	go func() {
		wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		break
	case err := <-errs:
		close(errs)
		return err
	}

	err := WatchEnvkeys()

	if err != nil {
		return err
	}

	return nil
}

func GetNamespaces() ([]string, error) {
	namespaceRes, err := kube.Client.CoreV1().Namespaces().List(context.TODO(), v1.ListOptions{LabelSelector: "!watcher.envkey.com/ignore"})
	if err != nil {
		return nil, err
	}
	namespaces := []string{}
	for _, namespace := range namespaceRes.Items {
		namespaces = append(namespaces, namespace.Name)
	}

	return namespaces, nil
}

func syncDeployments(namespace string) error {
	deploymentsRes, err := kube.Client.AppsV1().Deployments(namespace).List(context.TODO(), v1.ListOptions{LabelSelector: "!watcher.envkey.com/ignore"})

	if err != nil {
		log.WithError(err).Error("Error listing deployments")
		return err
	}

	for _, deployment := range deploymentsRes.Items {
		envkeySecrets := podTemplateSpecEnvkeySecrets(deployment.Spec.Template)

		extractEnvkeys(namespace, envkeySecrets, func(envkey string) {
			if DeploymentsByEnvkey[envkey] == nil {
				DeploymentsByEnvkey[envkey] = []apps.Deployment{deployment}
			} else {
				DeploymentsByEnvkey[envkey] = append(DeploymentsByEnvkey[envkey], deployment)
			}
		})
	}

	return nil
}

func syncDaemonSets(namespace string) error {
	daemonSetsRes, err := kube.Client.AppsV1().DaemonSets(namespace).List(context.TODO(), v1.ListOptions{LabelSelector: "!watcher.envkey.com/ignore"})

	if err != nil {
		log.WithError(err).Error("Error listing daemonSets")
		return err
	}

	for _, daemonSet := range daemonSetsRes.Items {
		envkeySecrets := podTemplateSpecEnvkeySecrets(daemonSet.Spec.Template)

		extractEnvkeys(namespace, envkeySecrets, func(envkey string) {
			if DaemonSetsByEnvkey[envkey] == nil {
				DaemonSetsByEnvkey[envkey] = []apps.DaemonSet{daemonSet}
			} else {
				DaemonSetsByEnvkey[envkey] = append(DaemonSetsByEnvkey[envkey], daemonSet)
			}
		})
	}

	return nil
}

func syncStatefulSets(namespace string) error {
	statefulSetsRes, err := kube.Client.AppsV1().StatefulSets(namespace).List(context.TODO(), v1.ListOptions{LabelSelector: "!watcher.envkey.com/ignore"})

	if err != nil {
		log.WithError(err).Error("Error listing statefulSets")
		return err
	}

	for _, statefulSet := range statefulSetsRes.Items {
		envkeySecrets := podTemplateSpecEnvkeySecrets(statefulSet.Spec.Template)

		extractEnvkeys(namespace, envkeySecrets, func(envkey string) {
			if StatefulSetsByEnvkey[envkey] == nil {
				StatefulSetsByEnvkey[envkey] = []apps.StatefulSet{statefulSet}
			} else {
				StatefulSetsByEnvkey[envkey] = append(StatefulSetsByEnvkey[envkey], statefulSet)
			}
		})
	}

	return nil
}

func extractEnvkeys(namespace string, envkeySecrets []string, setEnvkeyFn func(string)) error {
	errs := make(chan error)
	done := make(chan bool)
	var wg sync.WaitGroup

	for _, secretName := range envkeySecrets {
		wg.Add(1)
		go func(secretName string) {
			secretRes, err := kube.Client.CoreV1().Secrets(namespace).Get(context.TODO(), secretName, v1.GetOptions{})

			if err == nil {

				encoded := secretRes.Data["ENVKEY"]

				// if the ENVKEY is missing, log an error but keep going
				if len(encoded) == 0 {
					log.Errorf("ENVKEY not set in secret %s", secretName)
				} else {
					decoded, err := utils.Base64Decode(encoded)
					if err == nil {
						envkey := string(decoded)
						setEnvkeyFn(envkey)
					} else {
						log.Errorf("Error decoding base64 encoded ENVKEY in secret %s", secretName)
					}
				}

			} else {
				errs <- err
			}

			wg.Done()
		}(secretName)
	}

	go func() {
		wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		break
	case err := <-errs:
		close(errs)
		return err
	}

	return nil
}

func podTemplateSpecEnvkeySecrets(spec core.PodTemplateSpec) []string {
	var envkeySecrets []string

	for _, container := range spec.Spec.Containers {
		for _, env := range container.Env {
			if env.ValueFrom != nil && env.ValueFrom.SecretKeyRef != nil && env.ValueFrom.SecretKeyRef.Key == "ENVKEY" {
				envkeySecrets = append(envkeySecrets, env.ValueFrom.SecretKeyRef.Name)
			}
		}
	}

	if len(envkeySecrets) == 0 {
		return nil
	}

	return envkeySecrets
}
