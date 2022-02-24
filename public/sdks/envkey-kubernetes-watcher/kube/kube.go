package kube

import (
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

var Client *kubernetes.Clientset

func Init() error {
	// creates the in-cluster config
	config, err := rest.InClusterConfig()
	if err != nil {
		return err
	}
	// creates the clientset
	Client, err = kubernetes.NewForConfig(config)
	if err != nil {
		return err
	}

	return nil
}
